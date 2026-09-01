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
// validate the code and return the available balance so the
// checkout UI can show the discount.)
router.post('/gift-cards/:code/redeem', authenticate, async (req, res, next) => {
  try {
    const card = await getGiftCardByCode(req.params.code);
    if (!isRedeemable(card)) {
      throw new AppError('Gift card is not redeemable', 400);
    }
    res.json({
      status: 'success',
      data: {
        ...publicGiftCardView(card),
        redeemable: true,
        // The customer now knows the balance; checkout will debit it.
        availableBalance: card.balance,
        currency: card.currency,
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
    const currency = (typeof req.query.currency === 'string' && req.query.currency) || 'USD';
    const balance = await getStoreCreditBalance(req.user!.id, currency);
    const transactions = await listStoreCreditTransactions(req.user!.id, currency);
    res.json({
      status: 'success',
      data: { balance, currency, transactions },
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
    const updated = await creditStoreCredit({
      userId: body.userId,
      amount: body.amount,
      currency: body.currency,
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
    if (body.amount > 0) {
      const updated = await creditStoreCredit({
        userId: body.userId,
        amount: body.amount,
        type: 'adjust',
        notes: body.reason,
        createdById: req.user!.id,
      });
      return res.json({ status: 'success', data: updated });
    } else {
    // Negative adjust: treat as a debit. We don't have a public
    // debit function (the order pipeline uses one), so we reach
    // into the prisma to do a guarded decrement.
    const updated = await prisma.$transaction(async (tx: any) => {
      const credit = await getOrCreateStoreCredit(body.userId, body.currency);
      if (credit.balance + body.amount < 0) {
        throw new AppError(`Insufficient balance: would go negative`, 400);
      }
      const out = await tx.storeCredit.update({
        where: { id: credit.id },
        data: { balance: credit.balance + body.amount },
      });
      await tx.storeCreditTransaction.create({
        data: {
          storeCreditId: credit.id,
          amount: body.amount,  // already negative
          type: 'adjust',
          notes: body.reason,
          createdById: req.user!.id,
        },
      });
      return out;
    });
    return res.json({ status: 'success', data: updated });
  }
  } catch (err) { next(err); }
});

export default router;
