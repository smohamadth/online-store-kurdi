/**
 * Abandoned-cart recovery sweep.
 *
 * Everything this needs already existed - CartItem is persisted server-side
 * with updatedAt, users have emails, there is a job runner with a distributed
 * lock, and email.service renders templates - but nothing joined them up.
 *
 * The selection rules live in abandonedCart.helpers (pure, unit-tested); this
 * module is the I/O around them.
 */
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { env } from '../../config/environment';
import { sendAbandonedCartEmail } from '../../services/email.service';
import {
  buildUnsubscribeUrl, generateUnsubscribeToken, SUBSCRIBED, UNSUBSCRIBED,
} from '../newsletter/newsletter.helpers';
import {
  decideRecoveryEmail, MAX_AGE_HOURS, type CartCandidate,
} from './abandonedCart.helpers';

/**
 * Guarantee the address has an unsubscribe token.
 *
 * Creates a row in the 'subscribed' state only in the sense that the customer
 * is currently reachable for transactional-adjacent recovery mail; the point
 * is that they now have a working opt-out. consentAt is deliberately NULL and
 * the source records how the row came to exist, so this is never mistaken for
 * marketing consent the customer actually gave.
 */
async function ensureUnsubscribeToken(email: string, existingId: string | null) {
  const normalized = email.trim().toLowerCase();
  try {
    if (existingId) {
      return await prisma.newsletterSubscriber.update({
        where: { id: existingId },
        data: { unsubscribeToken: generateUnsubscribeToken() },
      });
    }
    return await prisma.newsletterSubscriber.create({
      data: {
        email: normalized,
        status: SUBSCRIBED,
        // No consent was given - this row exists so the opt-out link works.
        consentAt: null,
        source: 'abandoned-cart',
        unsubscribeToken: generateUnsubscribeToken(),
      },
    });
  } catch (err) {
    logger.error('Failed to mint an unsubscribe token:', err);
    return null;
  }
}

export type SweepResult = {
  considered: number;
  sent: number;
  skipped: Record<string, number>;
  errors: number;
  /** True when the scan cap stopped the sweep before it ran out of candidates. */
  scanTruncated?: boolean;
};

/**
 * Find carts eligible for a recovery email and send them.
 *
 * `dryRun` reports what WOULD be sent without mailing anyone - the only safe
 * way to try this against production data for the first time.
 */
export async function runAbandonedCartSweep(opts: {
  now?: Date;
  dryRun?: boolean;
  /** Cap on emails SENT in one sweep. */
  limit?: number;
  /**
   * Cap on candidates EXAMINED in one sweep.
   *
   * Separate from `limit` on purpose: capping sends alone means a store whose
   * carts are nearly all ineligible would walk every one of them (three
   * queries each) looking for someone to mail. This bounds the work; `limit`
   * bounds the mail.
   */
  maxScan?: number;
} = {}): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const dryRun = !!opts.dryRun;
  const limit = opts.limit ?? 500;
  // 10x the send budget: enough slack to walk past a long run of ineligible
  // carts and still reach real candidates, without ever becoming unbounded.
  const maxScan = opts.maxScan ?? Math.max(limit * 10, 1000);

  const cutoff = new Date(now.getTime() - MAX_AGE_HOURS * 3600_000);

  // Only carts touched inside the window are candidates. Anything older is
  // excluded in SQL rather than fetched and discarded.
  const items = await prisma.cartItem.findMany({
    where: { updatedAt: { gte: cutoff } },
    include: { product: true, user: true },
  });

  // Group lines into one candidate per user.
  const byUser = new Map<string, {
    userId: string; email: string | null; firstName: string | null;
    updatedAt: Date; itemCount: number; cartValue: number;
    lines: Array<{ name: string; quantity: number; price: number }>;
  }>();

  for (const it of items as any[]) {
    const userId = it.userId;
    const price = Number(it.product?.price ?? 0);
    const qty = Number(it.quantity ?? 0);
    const cur = byUser.get(userId) ?? {
      userId,
      email: it.user?.email ?? null,
      firstName: it.user?.firstName ?? null,
      updatedAt: new Date(it.updatedAt),
      itemCount: 0,
      cartValue: 0,
      lines: [] as Array<{ name: string; quantity: number; price: number }>,
    };
    cur.itemCount += qty;
    cur.cartValue += price * qty;
    cur.lines.push({ name: it.product?.name ?? 'Item', quantity: qty, price });
    // The cart's age is defined by its most RECENT change: adding a line
    // means the shopper is still active, so the clock should restart.
    const t = new Date(it.updatedAt);
    if (t > cur.updatedAt) cur.updatedAt = t;
    byUser.set(userId, cur);
  }

  const result: SweepResult = { considered: byUser.size, sent: 0, skipped: {}, errors: 0 };
  const bump = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };

  // `limit` is a cap on EMAILS SENT, not on candidates examined.
  //
  // It used to count every candidate, including skipped ones. Map iteration
  // follows the query's row order and skip decisions are deterministic, so a
  // store whose first N carts were all ineligible burned the whole budget on
  // them and mailed nobody - starving the same eligible customers on every
  // run while reporting "sent: 0" as though there were nothing to do.
  let examined = 0;
  for (const cand of byUser.values()) {
    if (result.sent >= limit) break;
    if (examined >= maxScan) {
      // Report the truncation rather than silently doing less work than the
      // caller expects - "sent: 0" with no explanation is what made the old
      // starvation bug invisible.
      result.scanTruncated = true;
      break;
    }
    examined += 1;

    try {
      const [alreadySent, ordersSince, optOut] = await Promise.all([
        prisma.abandonedCartEmail.findMany({ where: { userId: cand.userId } }),
        prisma.order.count({
          where: { userId: cand.userId, createdAt: { gte: cand.updatedAt } },
        }),
        cand.email
          ? prisma.newsletterSubscriber.findUnique({ where: { email: cand.email.toLowerCase() } })
          : Promise.resolve(null),
      ]);

      const candidate: CartCandidate = {
        userId: cand.userId,
        email: cand.email,
        updatedAt: cand.updatedAt,
        itemCount: cand.itemCount,
        cartValue: cand.cartValue,
        stagesSent: (alreadySent as any[]).map((r) => r.stage),
        orderedSince: ordersSince > 0,
        unsubscribed: (optOut as any)?.status === UNSUBSCRIBED,
      };

      const decision = decideRecoveryEmail(candidate, now);
      if (!decision.send) {
        bump(decision.reason);
        continue;
      }

      if (dryRun) {
        result.sent += 1;
        continue;
      }

      // Claim the (user, stage) slot BEFORE sending. The unique constraint
      // means a concurrent sweep loses the race here rather than both
      // discovering the row is missing and each sending a copy.
      let claimed: any;
      try {
        claimed = await prisma.abandonedCartEmail.create({
          data: {
            userId: cand.userId,
            stage: decision.stage,
            itemCount: cand.itemCount,
            cartValue: cand.cartValue,
          },
        });
      } catch {
        bump('already claimed');
        continue;
      }

      // Every marketing email must carry a WORKING one-click unsubscribe.
      //
      // A customer who never joined the newsletter has no subscriber row, so
      // there was no token and the link came out as `?token=` - which the
      // endpoint rejects with 400. That is a dead unsubscribe link on
      // marketing mail: a CAN-SPAM/GDPR violation and a guaranteed spam
      // complaint. Mint a suppression row for them instead, so the link works
      // and the opt-out is recorded for every future sweep.
      let subscriber = optOut as any;
      if (!subscriber?.unsubscribeToken) {
        subscriber = await ensureUnsubscribeToken(cand.email!, subscriber?.id ?? null);
      }
      if (!subscriber?.unsubscribeToken) {
        // Could not guarantee a working opt-out link, so do not send. Release
        // the claim first or this user is silently skipped forever.
        bump('no unsubscribe token');
        await prisma.abandonedCartEmail
          .delete({ where: { id: claimed.id } })
          .catch(() => undefined);
        continue;
      }

      const unsubscribeUrl = buildUnsubscribeUrl(
        env.FRONTEND_URL,
        subscriber.unsubscribeToken,
      );

      const ok = await sendAbandonedCartEmail({
        to: cand.email!,
        firstName: cand.firstName,
        items: cand.lines,
        cartValue: cand.cartValue,
        cartUrl: `${String(env.FRONTEND_URL).replace(/\/+$/, '')}/cart`,
        unsubscribeUrl,
        stage: decision.stage,
      });

      if (ok) {
        result.sent += 1;
      } else {
        // Release the claim so the next sweep can retry, otherwise a
        // transient SMTP failure permanently burns that stage for this user.
        result.errors += 1;
        await prisma.abandonedCartEmail
          .delete({ where: { id: claimed.id } })
          .catch(() => undefined);
      }
    } catch (err) {
      result.errors += 1;
      logger.error('Abandoned-cart sweep error for a user:', err);
    }
  }

  logger.info(
    `Abandoned-cart sweep: considered=${result.considered} examined=${examined} ` +
    `sent=${result.sent} errors=${result.errors}` +
    `${result.scanTruncated ? ' (scan cap reached)' : ''}`,
  );
  return result;
}

/**
 * Mark a recovery email as converted.
 *
 * Called after an order is placed. Without this the feature cannot be judged:
 * "we sent 400 emails" is not a result, "we recovered 38 carts" is.
 */
export async function markCartRecovered(userId: string, orderId: string): Promise<void> {
  try {
    const open = await prisma.abandonedCartEmail.findMany({
      where: { userId, recoveredAt: null },
    });
    for (const row of open as any[]) {
      await prisma.abandonedCartEmail.update({
        where: { id: row.id },
        data: { recoveredAt: new Date(), orderId },
      });
    }
  } catch (err) {
    logger.error('Failed to mark cart recovered:', err);
  }
}
