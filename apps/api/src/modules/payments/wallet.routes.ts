/**
 * Gift card + store credit HTTP routes.
 *
 *   GET  /api/gift-cards                  (admin: list)
 *   POST /api/gift-cards                  (admin: issue)
 *   GET  /api/gift-cards/:code            (auth: lookup; customer sees their own, admin sees all)
 *   POST /api/gift-cards/:code/redeem     (auth: apply code to user account; returns discount to use at checkout)
 *   GET  /api/gift-cards/:code/transactions
 *   POST /api/gift-cards/:id/cancel       (admin: void)
 *
 *   GET  /api/store-credit                (auth: own balance + history)
 *   POST /api/store-credit                (admin: credit; used at refund time)
 *   POST /api/store-credit/adjust         (admin: arbitrary +/- adjust)
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import {
  issueGiftCard,
  getGiftCardByCode,
  listGiftCards,
  getGiftCardTransactions,
  cancelGiftCard,
  creditGiftCard,
  publicGiftCardView,
  isRedeemable,
  normaliseCode,
} from './giftcard.service';
import {
  getOrCreateStoreCredit,
  getStoreCreditBalance,
  creditStoreCredit,
  listStoreCreditTransactions,
} from './storecredit.service';

const router = Router();

// ====================================================================
// Gift cards
// ====================================================================

const issueSchema = z.object({
  amount: z.number().positive().finite(), // .finite(): JSON 1e999 parses to Infinity
  currency: z.string().length(3).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional(),
});

// POST /api/gift-cards - admin: issue
router.post('/gift-cards', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const body = issueSchema.parse(req.body);
    const card = await issueGiftCard({
      amount: body.amount,
      currency: body.currency,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      notes: body.notes,
      createdById: req.user!.id,
    });
    res.status(201).json({ status: 'success', data: card });
  } catch (err) { next(err); }
});

// GET /api/gift-cards - admin: list
router.get('/gift-cards', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const cards = await listGiftCards({ status });
    res.json({ status: 'success', data: cards });
  } catch (err) { next(err); }
});

// GET /api/gift-cards/:code - lookup (public metadata only)
router.get('/gift-cards/:code', authenticate, async (req, res, next) => {
  try {
    const card = await getGiftCardByCode(req.params.code);
    res.json({ status: 'success', data: publicGiftCardView(card) });
  } catch (err) { next(err); }
});

// GET /api/gift-cards/:code/transactions - admin: full ledger
router.get('/gift-cards/:code/transactions', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const card = await getGiftCardByCode(req.params.code);
    const txs = await getGiftCardTransactions(card.id);
    res.json({ status: 'success', data: txs });
  } catch (err) { next(err); }
});

// POST /api/gift-cards/:code/redeem - apply code to the calling user
// (no debit happens here - that happens at order-placement. We just
// validate the code, CLAIM it to the calling account (first claim
// wins, so a card code that leaks can't be spent by whoever reads it
// first), and return the available balance so the checkout UI can
// show the discount.)
router.post('/gift-cards/:code/redeem', authenticate, async (req, res, next) => {
  try {
    const card = await getGiftCardByCode(req.params.code);
    if (!isRedeemable(card)) {
      throw new AppError('Gift card is not redeemable', 400);
    }
    // Claim the card for this account. Atomic: the WHERE makes two
    // concurrent claims resolve to exactly one winner; the loser
    // re-reads and gets the "already claimed" error.
    const claim = await prisma.giftCard.updateMany({
      where: { id: card.id, redeemedByUserId: null },
      data: { redeemedByUserId: req.user!.id, redeemedAt: new Date() },
    });
    if (claim.count === 0) {
      const fresh = await prisma.giftCard.findUnique({ where: { id: card.id } });
      if (fresh && fresh.redeemedByUserId && fresh.redeemedByUserId !== req.user!.id) {
        throw new AppError(
          'This gift card has already been claimed by another account. Check the code, or ask the store for a new one.',
          403,
        );
      }
      // Already claimed by this same user on an earlier check — fine.
    }
    res.json({
      status: 'success',
      data: {
        ...publicGiftCardView(card),
        redeemable: true,
        // The customer now knows the balance; checkout will debit it.
        availableBalance: card.balance,
        currency: card.currency,
        // Confirms the claim so the UI can tell the customer the card
        // is now linked to their account.
        claimedByMe: true,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/gift-cards/:id/cancel - admin: void a card
router.post('/gift-cards/:id/cancel', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const rawReason = (req.body as any)?.reason;
    if (rawReason != null && (typeof rawReason !== 'string' || rawReason.length > 500)) {
      throw new AppError('Cancellation reason must be a string of at most 500 characters.', 400);
    }
    const reason = rawReason || 'Cancelled by admin';
    const card = await cancelGiftCard(req.params.id, reason);
    res.json({ status: 'success', data: card });
  } catch (err) { next(err); }
});

// POST /api/gift-cards/:id/credit - admin: top up a card
router.post('/gift-cards/:id/credit', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const body = z.object({
      amount: z.number().positive().finite(), // .finite(): JSON 1e999 parses to Infinity
      type: z.enum(['refund', 'adjust', 'issue']).optional(),
      orderId: z.string().uuid().optional(),
      notes: z.string().max(500).optional(),
    }).parse(req.body);
    const card = await creditGiftCard({
      cardId: req.params.id,
      amount: body.amount,
      type: body.type,
      orderId: body.orderId,
      notes: body.notes,
    });
    res.json({ status: 'success', data: card });
  } catch (err) { next(err); }
});

// ====================================================================
// Store credit
// ====================================================================

// GET /api/store-credit - own balance + history
router.get('/store-credit', authenticate, async (req, res, next) => {
  try {
    // Default to the STORE's currency, not a hardcoded 'USD': a EUR
    // store's checkout reads this endpoint without a currency param and
    // would otherwise show a $0 balance while the EUR credit sits unused.
    let currency: string | undefined =
      typeof req.query.currency === 'string' && req.query.currency
        ? req.query.currency
        : undefined;
    if (!currency) {
      currency =
        (await prisma.storeSettings.findUnique({ where: { id: 'default' } }))?.currency || 'USD';
    }
    const balance = await getStoreCreditBalance(req.user!.id, currency);
    const transactions = await listStoreCreditTransactions(req.user!.id, currency);
    // Every balance the user holds, in every currency: if the store
    // changed currency after a balance was granted, the old-currency
    // balance is still here and the wallet page can surface it (it is
    // NOT spendable at checkout, which only reads the store currency).
    const allRows = await prisma.storeCredit.findMany({
      where: { userId: req.user!.id },
      select: { currency: true, balance: true },
    });
    res.json({
      status: 'success',
      data: {
        balance,
        currency,
        transactions,
        allBalances: allRows.map((r: any) => ({ currency: r.currency, balance: r.balance })),
      },
    });
  } catch (err) { next(err); }
});

// POST /api/store-credit - admin: credit a user
const creditSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive().finite(), // .finite(): JSON 1e999 parses to Infinity
  currency: z.string().length(3).optional(),
  type: z.enum(['refund', 'goodwill', 'adjust']).optional(),
  orderId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});
router.post('/store-credit', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const body = creditSchema.parse(req.body);
    // Validate the user exists before touching the credit row.
    // Without this, getOrCreateStoreCredit would happily create
    // a credit row for a non-existent userId.
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new AppError('User not found', 404);
    // Currency defaults to the store's currency (a EUR store granting
    // without a currency must not create an invisible USD balance).
    const currency = body.currency
      ?? (await prisma.storeSettings.findUnique({ where: { id: 'default' } }))?.currency
      ?? 'USD';
    const updated = await creditStoreCredit({
      userId: body.userId,
      amount: body.amount,
      currency,
      type: body.type,
      orderId: body.orderId,
      notes: body.notes,
      createdById: req.user!.id,
    });
    res.status(201).json({ status: 'success', data: updated });
  } catch (err) { next(err); }
});

// POST /api/store-credit/adjust - admin: arbitrary adjust (positive or negative)
const adjustSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().finite(), // .finite(): can be negative, but never Infinity/NaN
  currency: z.string().length(3).optional(),
  reason: z.string().min(1).max(500),
});
router.post('/store-credit/adjust', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const body = adjustSchema.parse(req.body);
    if (body.amount === 0) throw new AppError('amount must be non-zero', 400);
    // Same user-existence check as the credit route.
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new AppError('User not found', 404);
    const currency = body.currency
      ?? (await prisma.storeSettings.findUnique({ where: { id: 'default' } }))?.currency
      ?? 'USD';
    if (body.amount > 0) {
      const updated = await creditStoreCredit({
        userId: body.userId,
        amount: body.amount,
        currency,
        type: 'adjust',
        notes: body.reason,
        createdById: req.user!.id,
      });
      return res.json({ status: 'success', data: updated });
    } else {
      // Negative adjust: atomic conditional decrement. The old code
      // read the balance outside the transaction and wrote a computed
      // value, which could lose a concurrent update; the WHERE is now
      // evaluated at update time so the balance can never go negative.
      const updated = await prisma.$transaction(async (tx: any) => {
        let credit = await tx.storeCredit.findUnique({
          where: { userId_currency: { userId: body.userId, currency } },
        });
        if (!credit) {
          credit = await tx.storeCredit.create({
            data: { userId: body.userId, currency, balance: 0 },
          });
        }
        const dec = -body.amount; // positive
        const res = await tx.storeCredit.updateMany({
          where: { id: credit.id, balance: { gte: dec } },
          data: { balance: { decrement: dec } },
        });
        if (res.count !== 1) {
          throw new AppError('Insufficient balance: would go negative', 400);
        }
        await tx.storeCreditTransaction.create({
          data: {
            storeCreditId: credit.id,
            amount: body.amount,  // already negative
            type: 'adjust',
            notes: body.reason,
            createdById: req.user!.id,
          },
        });
        return tx.storeCredit.findUnique({ where: { id: credit.id } });
      });
      return res.json({ status: 'success', data: updated });
    }
  } catch (err) { next(err); }
});

export default router;
