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
}) {
  if (args.amount <= 0) throw new AppError('Credit amount must be positive', 400);
  return prisma.$transaction(async (tx: any) => {
    const credit = await getOrCreateStoreCredit(args.userId, args.currency);
    const updated = await tx.storeCredit.update({
      where: { id: credit.id },
      data: { balance: credit.balance + args.amount },
    });
    await tx.storeCreditTransaction.create({
      data: {
        storeCreditId: credit.id,
        amount: args.amount,
        type: args.type ?? 'adjust',
        orderId: args.orderId ?? null,
        notes: args.notes ?? null,
        createdById: args.createdById ?? null,
      },
    });
    return updated;
  });
}

/**
 * Debit the user's balance. Used at checkout when the customer
 * chooses "apply store credit". Returns the updated row plus the
 * amount actually debited (which may be less than the requested
 * amount if the balance is smaller than the order subtotal).
 */
export async function debitStoreCredit(args: {
  userId: string;
  amount: number;          // request: up to this much
  currency?: string;
  orderId?: string;
  notes?: string;
}): Promise<{ credit: any; applied: number }> {
  if (args.amount <= 0) return { credit: null, applied: 0 };
  return prisma.$transaction(async (tx: any) => {
    const credit = await getOrCreateStoreCredit(args.userId, args.currency);
    if (credit.balance <= 0) {
      return { credit, applied: 0 };
    }
    const applied = Math.min(credit.balance, args.amount);
    const updated = await tx.storeCredit.update({
      where: { id: credit.id },
      data: { balance: credit.balance - applied },
    });
    await tx.storeCreditTransaction.create({
      data: {
        storeCreditId: credit.id,
        amount: -applied,
        type: 'order_use',
        orderId: args.orderId ?? null,
        notes: args.notes ?? null,
      },
    });
    return { credit: updated, applied };
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
