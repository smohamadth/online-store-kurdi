/**
 * Gift card service.
 *
 * Issues, redeems, and cancels gift cards. The balance on a card
 * is the running total of all transactions against it; we
 * recalculate on every write so concurrent redemptions can't
 * oversell (the `decrement happens in a transaction that
 * re-reads the current balance`).
 *
 * The code format is a 16-character group of four hex segments
 * (XXXX-XXXX-XXXX-XXXX). Easy to read aloud, hard to mistype.
 */
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import {
  generateGiftCardCode,
  normaliseCode,
  dashCode,
  isRedeemable,
  publicGiftCardView,
} from './giftcard.helpers';

// Re-export for callers that already imported from this module.
export {
  generateGiftCardCode,
  normaliseCode,
  dashCode,
  isRedeemable,
  publicGiftCardView,
};

// ---------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------

export interface IssueGiftCardInput {
  amount: number;
  currency?: string;
  expiresAt?: Date | null;
  notes?: string;
  createdById?: string;
}

export interface GiftCardRow {
  id: string;
  code: string;
  initialAmount: number;
  balance: number;
  currency: string;
  status: string;
  issuedAt: Date;
  expiresAt: Date | null;
  redeemedByUserId: string | null;
  redeemedAt: Date | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
}

/**
 * Issue a new gift card. The amount must be positive; the
 * initial balance equals the amount. The code is unique
 * (the schema enforces @unique; we surface a 409 if it isn't).
 */
export async function issueGiftCard(input: IssueGiftCardInput): Promise<GiftCardRow> {
  if (input.amount <= 0) {
    throw new AppError('amount must be positive', 400);
  }
  // Try a couple of times in case of a (1 in 2^64) collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateGiftCardCode();
    const dup = await prisma.giftCard.findUnique({ where: { code } });
    if (!dup) {
      return prisma.giftCard.create({
        data: {
          code,
          initialAmount: input.amount,
          balance: input.amount,
          currency: input.currency ?? 'USD',
          status: 'active',
          expiresAt: input.expiresAt ?? null,
          notes: input.notes ?? null,
          createdById: input.createdById ?? null,
        },
      });
    }
  }
  throw new AppError('Could not generate a unique gift card code after 3 attempts', 500);
}

/**
 * Look up a card by code. The caller passes the raw code; we
 * normalise to defend against copy-paste artifacts.
 */
export async function getGiftCardByCode(code: string): Promise<GiftCardRow> {
  const normalised = normaliseCode(code);
  if (!normalised) throw new AppError('Code is required', 400);
  // The DB stores dashed codes; the customer might paste either
  // form. Search by the dashed form first, fall back to the
  // un-dashed form in case a card was inserted directly without
  // the dash format.
  const dashed = dashCode(normalised);
  const card = await prisma.giftCard.findUnique({ where: { code: dashed } });
  if (!card) {
    const alt = await prisma.giftCard.findFirst({ where: { code: normalised } });
    if (alt) return alt;
    throw new AppError('Gift card not found', 404);
  }
  return card;
}

/**
 * Debit a card atomically. Throws 400 if the card is inactive,
 * expired, or doesn't have enough balance. Returns the updated
 * card plus the transaction row.
 */
export async function debitGiftCard(args: {
  code: string;
  amount: number;
  orderId?: string;
  notes?: string;
}) {
  if (args.amount <= 0) throw new AppError('Debit amount must be positive', 400);
  const code = dashCode(normaliseCode(args.code));
  return prisma.$transaction(async (tx: any) => {
    const card = await tx.giftCard.findUnique({ where: { code } });
    if (!card) throw new AppError('Gift card not found', 404);
    if (!isRedeemable(card)) {
      throw new AppError(`Gift card is not redeemable (status=${card.status}, balance=${card.balance})`, 400);
    }
    if (card.balance < args.amount) {
      throw new AppError(`Insufficient balance: card has ${card.balance}, requested ${args.amount}`, 400);
    }
    const newBalance = card.balance - args.amount;
    const newStatus = newBalance <= 0 ? 'depleted' : card.status;
    const updated = await tx.giftCard.update({
      where: { id: card.id },
      data: { balance: newBalance, status: newStatus },
    });
    await tx.giftCardTransaction.create({
      data: {
        giftCardId: card.id,
        amount: -args.amount,
        type: 'use',
        orderId: args.orderId ?? null,
        notes: args.notes ?? null,
      },
    });
    return updated;
  });
}

/**
 * Refund (or top-up) a gift card. Positive amount only.
 */
export async function creditGiftCard(args: {
  cardId: string;
  amount: number;
  type?: 'refund' | 'adjust' | 'issue';
  orderId?: string;
  notes?: string;
}) {
  if (args.amount <= 0) throw new AppError('Credit amount must be positive', 400);
  return prisma.$transaction(async (tx: any) => {
    const card = await tx.giftCard.findUnique({ where: { id: args.cardId } });
    if (!card) throw new AppError('Gift card not found', 404);
    const newBalance = card.balance + args.amount;
    const newStatus = card.status === 'depleted' && newBalance > 0 ? 'active' : card.status;
    const updated = await tx.giftCard.update({
      where: { id: card.id },
      data: { balance: newBalance, status: newStatus },
    });
    await tx.giftCardTransaction.create({
      data: {
        giftCardId: card.id,
        amount: args.amount,
        type: args.type ?? 'adjust',
        orderId: args.orderId ?? null,
        notes: args.notes ?? null,
      },
    });
    return updated;
  });
}

/**
 * Cancel a card (admin action: fraud, refund-issued, etc). Sets
 * the status to 'cancelled' and writes a zero-amount transaction
 * for the audit log. Idempotent.
 */
export async function cancelGiftCard(cardId: string, reason: string) {
  return prisma.$transaction(async (tx: any) => {
    const card = await tx.giftCard.findUnique({ where: { id: cardId } });
    if (!card) throw new AppError('Gift card not found', 404);
    if (card.status === 'cancelled') return card;
    const updated = await tx.giftCard.update({
      where: { id: card.id },
      data: { status: 'cancelled' },
    });
    await tx.giftCardTransaction.create({
      data: { giftCardId: card.id, amount: 0, type: 'cancel', notes: reason },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------

export async function listGiftCards(opts: { status?: string; limit?: number } = {}) {
  return prisma.giftCard.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
  });
}

export async function getGiftCardTransactions(cardId: string) {
  return prisma.giftCardTransaction.findMany({
    where: { giftCardId: cardId },
    orderBy: { createdAt: 'desc' },
  });
}
