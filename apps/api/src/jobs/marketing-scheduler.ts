/**
 * Marketing scheduler.
 *
 * Runs the abandoned-cart recovery sweep on a fixed interval. Without this
 * the sweep only ran when an admin POSTed to /api/marketing/abandoned-carts/run,
 * so the feature did nothing on its own.
 *
 * Every tick is guarded by the same database-backed distributed lock the
 * inventory scheduler uses, so running several API instances behind a load
 * balancer still sends each reminder once - the other instances observe the
 * held lease and skip. That matters more here than for inventory: a duplicate
 * inventory tick is wasted work, a duplicate marketing tick is a customer
 * receiving the same email twice.
 *
 * DEFAULT OFF. Sending email to customers is not something a store should
 * start doing because it upgraded: it needs a working SMTP configuration, a
 * newsletter list with real consent, and an operator who has decided to turn
 * it on. Set ABANDONED_CART_SCHEDULER=on to enable.
 */
import { runAbandonedCartSweep } from '../modules/marketing/abandonedCart.service';
import { runWithLock } from './distributedLock';
import { logger } from '../utils/logger';

/**
 * Hourly. The recovery stages are 1h and 24h, so a tick more frequent than
 * the shortest stage buys nothing, and a slower one would let the 1h nudge
 * drift late enough to feel random.
 */
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

const LOCK_NAME = 'abandoned-cart';
// Lease slightly longer than the interval: a slow sweep is never stolen
// mid-flight, and a crashed owner frees the job by the next tick.
const LOCK_LEASE_MS = DEFAULT_INTERVAL_MS + 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

/** True when the operator has explicitly opted in. */
export function isEnabled(): boolean {
  return process.env.ABANDONED_CART_SCHEDULER === 'on';
}

/**
 * Dry-run mode: report what WOULD be sent without mailing anyone.
 *
 * The recommended first step on a live store - it exercises the whole
 * selection path against real carts with no risk of a mistaken send.
 */
export function isDryRun(): boolean {
  return process.env.ABANDONED_CART_DRY_RUN === 'true';
}

export async function runOnce(): Promise<{ sent: number; considered: number }> {
  if (running) {
    // A tick firing while the previous sweep is still in flight would race it
    // to the same (userId, stage) rows. The unique constraint would catch the
    // duplicate, but skipping is cheaper and quieter.
    return { sent: 0, considered: 0 };
  }
  running = true;
  try {
    const dryRun = isDryRun();
    const result = await runAbandonedCartSweep({ dryRun });
    logger.info(
      `[marketing-scheduler] considered=${result.considered} sent=${result.sent} ` +
      `errors=${result.errors}${dryRun ? ' (DRY RUN - nothing was emailed)' : ''}`,
    );
    return { sent: result.sent, considered: result.considered };
  } catch (err: any) {
    logger.error(`[marketing-scheduler] failed: ${err?.message ?? err}`);
    return { sent: 0, considered: 0 };
  } finally {
    running = false;
  }
}

/**
 * One scheduled tick under the distributed lock. runWithLock never throws, so
 * the timer callback cannot become an unhandled rejection.
 */
async function tick(): Promise<void> {
  await runWithLock(LOCK_NAME, LOCK_LEASE_MS, () => runOnce());
}

export function startScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (!isEnabled()) {
    logger.info(
      '[marketing-scheduler] disabled (set ABANDONED_CART_SCHEDULER=on to enable)',
    );
    return;
  }
  if (timer) return;

  logger.info(
    `[marketing-scheduler] starting; tick=${intervalMs}ms` +
    `${isDryRun() ? ' DRY RUN' : ''}`,
  );

  // Deliberately NO catch-up run on startup, unlike the inventory scheduler.
  // A restart loop would otherwise mail customers once per restart; waiting a
  // full interval costs nothing when the shortest stage is an hour old.
  timer = setInterval(() => { tick(); }, intervalMs);
  if (timer.unref) timer.unref(); // never keep the process alive just for this
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
