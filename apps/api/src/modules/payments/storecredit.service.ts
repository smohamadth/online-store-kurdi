/**
 * Store credit service.
 *
 * A per-user balance that's issued on refund or as a goodwill
 * gesture, and debited at checkout. Simpler than gift cards:
 * no codes, no expiration. The same append-only ledger pattern
 * is used for the audit trail.
 *
 * One row per (userId, currency) - so a user with USD and EUR
 * balances has two rows. The (userId, currency) pair is the
 * natural key.
 */
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { autoPostDepositIssuance } from '../accounting/accounting.service';

// ---------------------------------------------------------------------
// Balance arithmetic
// ---------------------------------------------------------------------

/**
 * Get or create the user's store-credit row for a given
 * currency. Idempotent: a fresh user gets a row with balance=0
 * the first time the balance is touched.
 */
export async function getOrCreateStoreCredit(userId: string, currency: string = 'USD') {
  const existing = await prisma.storeCredit.findUnique({
    where: { userId_currency: { userId, currency } },
  });
  if (existing) return existing;
  return prisma.storeCredit.create({ data: { userId, currency, balance: 0 } });
}

/**
 * The user's current balance. Returns 0 if the row doesn't
 * exist (i.e. the user has never received credit).
 */
export async function getStoreCreditBalance(userId: string, currency: string = 'USD'): Promise<number> {
  const row = await prisma.storeCredit.findUnique({
    where: { userId_currency: { userId, currency } },
  });
  return row ? row.balance : 0;
}

/**
 * Credit the user's balance. Used at refund time and for
 * goodwill credits issued by an admin. Returns the updated row.
 */
export async function creditStoreCredit(args: {
  userId: string;
  amount: number;
  currency?: string;
  type?: 'refund' | 'goodwill' | 'adjust';
  orderId?: string;
  notes?: string;
  createdById?: string;
  /** Optional chart-account code for the contra side of the auto-posted journal entry. */
  accountCode?: string;
}) {
  if (args.amount <= 0) throw new AppError('Credit amount must be positive', 400);
  const currency = args.currency ?? 'USD';
  const type = args.type ?? 'adjust';
  const result = await prisma.$transaction(async (tx: any) => {
    // Upsert keeps the get-or-create race-free: two concurrent first-time
    // credits can never create two balance rows (the old read-then-create
    // could), and the increment is a single atomic UPDATE, so concurrent
    // credits/debits can never lose an update (a read-modify-write in two
    // transactions both computing the same new balance could).
    const updated = await tx.storeCredit.upsert({
      where: { userId_currency: { userId: args.userId, currency } },
      update: { balance: { increment: args.amount } },
      create: { userId: args.userId, currency, balance: args.amount },
    });
    await tx.storeCreditTransaction.create({
      data: {
        storeCreditId: updated.id,
        amount: args.amount,
        type,
        orderId: args.orderId ?? null,
        notes: args.notes ?? null,
        createdById: args.createdById ?? null,
      },
    });
    return updated;
  });

  // Best-effort journal posting (ACCOUNTING_AUTO_POST gate; never throws):
  // the deposits liability grew, so the ledger must reflect it.
  // 'refund' is skipped — the refund flow already posts it via
  // autoPostRefund(toStoreCredit) and posting again would double-count.
  if (type !== 'refund') {
    await autoPostDepositIssuance({
      amount: args.amount,
      currency,
      type,
      orderId: args.orderId,
      memo: `Store credit ${type}${args.notes ? ` — ${args.notes}` : ''}`,
      accountCode: args.accountCode,
    });
  }
  return result;
}

/**
 * Debit the user's balance. Used at checkout when the customer
 * chooses "apply store credit". Returns the updated row plus the
 * amount actually debited (which may be less than the requested
 * amount if the balance is smaller than the order subtotal).
 *
 * Race-safe: the balance is decremented with an atomic conditional
 * UPDATE (`WHERE balance >= amount`), so two concurrent checkouts can
 * never spend the same balance twice. The partial case re-reads the
 * current balance and uses a compare-and-swap, retrying if a
 * concurrent transaction moved it between the read and the write.
 */
export async function debitStoreCredit(args: {
  userId: string;
  amount: number;          // request: up to this much
  currency?: string;
  orderId?: string;
  notes?: string;
}): Promise<{ credit: any; applied: number }> {
  if (args.amount <= 0) return { credit: null, applied: 0 };
  const currency = args.currency ?? 'USD';
  return prisma.$transaction(async (tx: any) => {
    // Race-free get-or-create (see creditStoreCredit).
    const credit = await tx.storeCredit.upsert({
      where: { userId_currency: { userId: args.userId, currency } },
      update: {},
      create: { userId: args.userId, currency, balance: 0 },
    });
    if (credit.balance <= 0) {
      return { credit, applied: 0 };
    }

    let applied = 0;
    // Full amount first: conditional atomic decrement. In a real
    // database this is `UPDATE ... SET balance = balance - ? WHERE
    // id = ? AND balance >= ?` — the WHERE is evaluated at update
    // time, so a concurrent debit that commits first makes this
    // match nothing instead of overspending.
    const full = await tx.storeCredit.updateMany({
      where: { id: credit.id, balance: { gte: args.amount } },
      data: { balance: { decrement: args.amount } },
    });
    if (full.count === 1) {
      applied = args.amount;
    } else {
      // Balance is less than requested: take what is left, with a
      // compare-and-swap on the exact balance so a concurrent change
      // between the read and the write is retried, never clobbered.
      for (let attempt = 0; attempt < 3 && applied === 0; attempt++) {
        const row = await tx.storeCredit.findUnique({ where: { id: credit.id } });
        const balance = row?.balance ?? 0;
        if (balance <= 0) break;
        const take = Math.min(balance, args.amount);
        if (take <= 0) break;
        const cas = await tx.storeCredit.updateMany({
          where: { id: credit.id, balance },
          data: { balance: { decrement: take } },
        });
        if (cas.count === 1) applied = take;
      }
    }

    if (applied > 0) {
      await tx.storeCreditTransaction.create({
        data: {
          storeCreditId: credit.id,
          amount: -applied,
          type: 'order_use',
          orderId: args.orderId ?? null,
          notes: args.notes ?? null,
        },
      });
      const updated = await tx.storeCredit.findUnique({ where: { id: credit.id } });
      return { credit: updated ?? credit, applied };
    }
    return { credit, applied: 0 };
  });
}

/**
 * The full transaction history for one user. Newest first.
 */
export async function listStoreCreditTransactions(userId: string, currency: string = 'USD') {
  const credit = await prisma.storeCredit.findUnique({
    where: { userId_currency: { userId, currency } },
    include: { transactions: { orderBy: { createdAt: 'desc' } } },
  });
  return credit?.transactions ?? [];
}
