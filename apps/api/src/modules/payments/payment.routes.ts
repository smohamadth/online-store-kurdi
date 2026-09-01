// ---------------------------------------------------------------------------
// Payments API (mounted at /api/payments).
//
//   - POST /webhooks/stripe : the ONLY real payment path. Stripe calls it
//     (public, HMAC-verified) and markOrderPaidByStripe settles the order
//     idempotently. Card checkout itself is created in order.routes.ts.
//   - POST /process          : the OFFLINE settlement endpoint - staff
//     record a bank transfer / COD collection. It is deliberately NOT a
//     gateway: by default only staff can call it (the PAYMENTS_ALLOW_MOCK
//     env flag re-opens it for local demos). See the SECURITY comment on
//     the route for why.
//   - GET /, GET /order/:id  : payment ledger (admin / order owner).
//   - POST /refund           : admin refunds.
//
// Gift cards + store credit are their own files (wallet.routes.ts).
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { NotFoundError, AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { getStripe } from '../../config/stripe';
import { env } from '../../config/environment';
import { autoPostOrder, autoPostRefund } from '../accounting/accounting.service';
import { createCommissionForOrder, voidCommissionForOrder } from '../affiliates/affiliate.service';
import { verifyAndSettleGatewayPayment, refundGatewayPayment } from './gateway.service';
import { creditStoreCredit } from './storecredit.service';
import { getGatewayById, isGatewayMethod } from './gateways/registry';
import { sendPaymentConfirmation, sendRefundConfirmation } from '../../services/email.service';
import { parsePagination } from '../../utils/pagination';
import type Stripe from 'stripe';

const router = Router();

/**
 * Settle an order from a verified Stripe Checkout completion.
 * Idempotent: replayed webhooks (Stripe retries on any non-2xx) must
 * not create duplicate payments.
 */
export async function markOrderPaidByStripe(
  orderId: string,
  session: Stripe.Checkout.Session
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    // The webhook can arrive after the order row is cleaned up by a
    // retention job; nothing to do, but log so a merchant noticing
    // "paid but not processing" can trace it.
    logger.warn(`Stripe webhook for unknown order ${orderId} (session ${session.id})`);
    return;
  }
  if (order.paymentStatus === 'completed') return;

  const stripePaymentId =
    (typeof session.payment_intent === 'string' ? session.payment_intent : null) ?? session.id;

  // Create the Payment row and flip the order inside ONE transaction, and
  // dedupe on the gateway's stable transaction id: a webhook retry after a
  // crash between the two writes used to create a second Payment row for
  // the same money (Stripe retries for days). If the row already exists
  // but the order never flipped, repair the order instead of duplicating.
  await prisma.$transaction(async (tx: any) => {
    const dup = await tx.payment.findFirst({
      where: { orderId, transactionId: stripePaymentId, status: 'completed' },
    });
    if (dup) {
      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'completed',
          paymentIntentId: stripePaymentId,
          status: 'processing',
        },
      });
      return;
    }
    await tx.payment.create({
      data: {
        orderId,
        amount: order.totalAmount,
        currency: (session.currency || 'usd').toUpperCase(),
        method: 'stripe',
        status: 'completed',
        transactionId: stripePaymentId,
        gatewayResponse: JSON.stringify({
          source: 'stripe_checkout',
          sessionId: session.id,
          paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          event: 'checkout.session.completed',
          timestamp: new Date().toISOString(),
        }),
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'completed',
        paymentIntentId: stripePaymentId,
        status: 'processing',
      },
    });
  });

  // Best-effort: when ACCOUNTING_AUTO_POST=true, post the sale entry. Never
  // throws, so a posting hiccup cannot fail the (idempotent) webhook.
  await autoPostOrder(orderId);

  // Best-effort affiliate commission for referred orders (idempotent on
  // orderId; never throws).
  await createCommissionForOrder(orderId);

  // Fire-and-forget: email the customer that their payment was received.
  await notifyPaymentReceived(orderId).catch(() => {});

  logger.info(`Stripe settled order ${order.orderNumber} via checkout session ${session.id}`);
}

/**
 * Send the payment-confirmation email for a newly-paid order. Never throws:
 * an email failure must not fail the settlement that triggered it.
 */
async function notifyPaymentReceived(orderId: string): Promise<void> {
  const [order, orderUser] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: { shippingAddress: true },
    }),
    prisma.order
      .findUnique({ where: { id: orderId }, select: { userId: true } })
      .then((o: { userId: string } | null) =>
        o ? prisma.user.findUnique({ where: { id: o.userId }, select: { firstName: true, email: true } }) : null,
      ),
  ]);
  if (!order || !orderUser) return;
  await sendPaymentConfirmation(order, orderUser);
}

/** Fire-and-forget: email the customer that their order was refunded. */
async function notifyRefundIssued(
  orderId: string,
  reason?: string,
  refundedAmount?: number,
  toStoreCredit?: boolean,
): Promise<void> {
  const [order, orderUser] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, include: { shippingAddress: true } }),
    prisma.order
      .findUnique({ where: { id: orderId }, select: { userId: true } })
      .then((o: { userId: string } | null) =>
        o ? prisma.user.findUnique({ where: { id: o.userId }, select: { firstName: true, email: true } }) : null,
      ),
  ]);
  if (!order || !orderUser) return;
  await sendRefundConfirmation(order, orderUser, reason, refundedAmount, { toStoreCredit });
}

// POST /api/payments/webhooks/stripe - Stripe Checkout webhook
//
// Public by design (Stripe calls it), but the payload must carry a
// valid Stripe-Signature header verified against STRIPE_WEBHOOK_SECRET
// before any order state changes. We use req.rawBody: the app-level
// express.json verify hook stashes the exact request bytes before
// parsing, which is what constructEvent needs.
router.post('/webhooks/stripe', async (req, res, next) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new AppError('Stripe is not configured for this store', 501);
    }
    const signature = req.header('Stripe-Signature') || '';
    const rawBody: string = (req as any).rawBody || '';
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET!);
    } catch (err) {
      logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      throw new AppError('Invalid Stripe webhook signature', 400);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = (session.metadata?.orderId as string) || undefined;
      if (orderId) {
        await markOrderPaidByStripe(orderId, session);
      } else {
        logger.warn(`Stripe checkout session ${session.id} completed without order metadata`);
      }
    }
    // Every other event type is acknowledged: Stripe retries on non-2xx,
    // and 4xx/5xx for events we don't handle would just be noise.
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/gateways/:gatewayId/verify - confirm a gateway return.
//
// The gateway redirects the customer back to /checkout?gateway=..&order=..
// and the storefront calls this endpoint with the gateway's callback params
// (authority, id, token, ...). The gateway is asked server-to-server to
// confirm the payment; on success the order is settled idempotently. Only
// the order owner (or an admin) may verify it.
router.post('/gateways/:gatewayId/verify', authenticate, async (req, res, next) => {
  try {
    const { gatewayId } = req.params;
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ status: 'error', message: 'orderId is required' });
    }
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Order');
    if (order.userId !== req.user?.id && req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }
    if (order.paymentStatus === 'completed') {
      return res.json({ status: 'success', data: { success: true, message: 'Order already paid.' } });
    }

    const { success, message, transactionId } = await verifyAndSettleGatewayPayment({
      gatewayId,
      orderId,
      callbackParams: req.body.callbackParams || {},
    });
    res.json({ status: 'success', data: { success, message, transactionId } });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments - Get payments (admin only)
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { limit: 20 });

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              userId: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.count(),
    ]);

    res.json({
      status: 'success',
      data: payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/process - Process payment (mock implementation)
router.post('/process', authenticate, async (req, res, next) => {
  try {
    const { orderId, paymentMethod, paymentDetails } = req.body;

    // SECURITY: this endpoint does not talk to a payment gateway - it simply
    // marks an order as paid. Exposed to customers, any logged-in buyer could
    // POST their own orderId and receive the goods for free (verified: order
    // moved to paymentStatus=completed / status=processing with no card).
    //
    // Until a real gateway (Stripe/PayPal) is integrated, only staff may
    // settle a payment - e.g. recording a bank transfer or a cash-on-delivery
    // collection. Set PAYMENTS_ALLOW_MOCK=true to re-open it for local demos.
    const mockAllowed = process.env.PAYMENTS_ALLOW_MOCK === 'true';
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'manager';

    if (!isStaff && !mockAllowed) {
      throw new AppError(
        'Online payment is not enabled for this store. Please choose cash on delivery or bank transfer.',
        501
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.userId !== req.user?.id && req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    if (
      order.paymentStatus === 'completed' ||
      order.paymentStatus === 'partially_refunded' ||
      order.paymentStatus === 'refunded'
    ) {
      throw new AppError('Order already paid', 400);
    }

    // The settled method is written to the Payment ledger. `refund` must
    // never be settable here: the refund route counts method='refund'
    // rows to decide how much can still be refunded, so accepting it
    // would mint a fake refund and shrink the order's remaining balance.
    // Only known gateways and the manual settlement methods are allowed.
    const ALLOWED_MANUAL_METHODS = new Set(['cash_on_delivery', 'bank_transfer']);
    const method = paymentMethod == null ? 'stripe' : String(paymentMethod);
    if (method.length > 50 || (!ALLOWED_MANUAL_METHODS.has(method) && !isGatewayMethod(method))) {
      throw new AppError('Invalid payment method.', 400);
    }

    // Mock payment processing
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const storeSettingsRow = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    const storeCurrency = storeSettingsRow?.currency || 'USD';

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount: order.totalAmount,
        currency: storeCurrency,
        method,
        status: 'completed',
        transactionId,
        // Stored as a JSON string column - serialise it. Passing the raw
        // object made every payment attempt fail with a Prisma 500.
        gatewayResponse: JSON.stringify({
          success: true,
          transactionId,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    // Update order payment status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'completed',
        paymentIntentId: transactionId,
        status: 'processing',
      },
    });

    // Best-effort auto-posting of the settled sale (ACCOUNTING_AUTO_POST=true).
    await autoPostOrder(orderId);

    // Best-effort affiliate commission for referred orders (idempotent on
    // orderId; never throws).
    await createCommissionForOrder(orderId);

    // Fire-and-forget: email the customer that their COD/bank-transfer
    // payment was recorded. Never fails the settlement.
    await notifyPaymentReceived(orderId).catch(() => {});

    logger.info(`Payment processed for order ${order.orderNumber}: ${transactionId}`);

    res.json({
      status: 'success',
      data: payment,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/refund - Process refund (admin only)
router.post('/refund', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { orderId, amount, reason, creditToStoreCredit } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.paymentStatus !== 'completed' && order.paymentStatus !== 'partially_refunded') {
      throw new AppError('Order payment not completed', 400);
    }

    // The reason is embedded in the ledger's gatewayResponse JSON and
    // emailed to the customer — cap it like the order-cancel reason so a
    // multi-megabyte string cannot bloat the database or the email.
    if (reason != null && (typeof reason !== 'string' || reason.length > 500)) {
      throw new AppError('Refund reason must be a string of at most 500 characters.', 400);
    }

    // Cumulative amount already refunded across prior refund rows (this order
    // can be refunded in parts, each creating its own Payment row).
    const refundedSoFar = (order.payments || [])
      .filter((p: any) => p.method === 'refund' && p.status === 'completed')
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    const walletApplied = (order.storeCreditApplied || 0) + (order.giftCardApplied || 0);
    // Cash refunds can only return money that was actually paid in cash:
    // the wallet-credit portion was never charged to a card / collected
    // on delivery, so refunding it as cash would over-pay the customer.
    const remainingCash = Math.max(0, order.totalAmount - walletApplied - refundedSoFar);
    // A "credit back to store credit" refund returns value to the
    // customer's store-credit balance instead, so it may cover the
    // wallet portion too (the full unpaid-by-cash remainder).
    const remaining = creditToStoreCredit
      ? Math.max(0, order.totalAmount - refundedSoFar)
      : remainingCash;
    // Default to the remaining amount (full refund of what is left); a partial
    // `amount` refunds less. Guard against non-numeric/negative/NaN input.
    const refundAmount = amount == null ? remaining : Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new AppError('Refund amount must be a positive number.', 400);
    }
    if (refundedSoFar + refundAmount > remaining + refundedSoFar + 1e-9) {
      throw new AppError(
        creditToStoreCredit
          ? `Refund amount exceeds the remaining balance (${remaining.toFixed(2)}).`
          : `Refund amount exceeds the amount actually paid in cash (${remainingCash.toFixed(2)}); use creditToStoreCredit=true to refund the wallet-credit portion to the customer's store credit.`,
        400,
      );
    }

    // The Order row has no currency column, so the store's current
    // currency (same source the settle path uses) applies to both the
    // store-credit balance AND the refund Payment row below.
    const storeSettingsRow = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    const storeCurrency = storeSettingsRow?.currency || 'USD';

    // creditToStoreCredit=true: nothing ever left the store in cash for
    // this amount, so no gateway money movement — the customer's store
    // credit balance is credited instead (atomic, ledgered). The credit
    // MUST land in the store's currency: a EUR store refunding without a
    // currency used to create an invisible USD balance that checkout
    // (which reads the EUR balance) could never spend.
    if (creditToStoreCredit) {
      await creditStoreCredit({
        userId: order.userId,
        amount: refundAmount,
        currency: storeCurrency,
        type: 'refund',
        orderId,
        notes: reason || 'Refund issued as store credit',
        createdById: req.user!.id,
      });
    }

    // If this order was paid through a hosted gateway, actually move the money
    // back to the customer before recording anything locally. Only when the
    // gateway confirms do we mark the order refunded — otherwise the store
    // would claim a refund it never issued.
    const gateway = getGatewayById(order.paymentMethod);
    let gatewayRefund: { success: boolean; transactionId?: string | null; message?: string; raw?: unknown } | null = null;

    if (gateway && !creditToStoreCredit) {
      if (!gateway.refundPayment) {
        throw new AppError(
          `${gateway.name} does not expose an API for refunds. Please issue this refund in the ${gateway.name} dashboard, then re-run the refund here.`,
          400,
        );
      }
      try {
        gatewayRefund = await refundGatewayPayment({
          gatewayId: gateway.id,
          orderId,
          amount: refundAmount,
          reason,
        });
      } catch (err) {
        throw new AppError((err as Error).message, 400);
      }
      if (!gatewayRefund.success) {
        throw new AppError(
          `Gateway refund failed: ${gatewayRefund.message || 'unknown error'}. The order was NOT marked refunded.`,
          502,
        );
      }
    }

    // Create refund payment record. Currency is the store's current
    // currency, already resolved above.
    const refund = await prisma.payment.create({
      data: {
        orderId,
        amount: refundAmount,
        currency: storeCurrency,
        method: 'refund',
        status: 'completed',
        transactionId: gatewayRefund?.transactionId || `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        gatewayResponse: JSON.stringify({
          success: true,
          reason,
          originalTransaction: order.paymentIntentId,
          gateway: gateway?.id || null,
          gatewayRefund,
          creditToStoreCredit: creditToStoreCredit === true,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    // Partial vs full refund: only a full refund marks the whole order
    // refunded; a partial refund flips paymentStatus to partially_refunded
    // and leaves the fulfilment status unchanged.
    const newRefundedTotal = refundedSoFar + refundAmount;
    const isFullRefund = newRefundedTotal + 1e-9 >= order.totalAmount;
    await prisma.order.update({
      where: { id: orderId },
      data: isFullRefund
        ? { paymentStatus: 'refunded', status: 'refunded' }
        : { paymentStatus: 'partially_refunded' },
    });

    // Best-effort auto-posting of the refund (ACCOUNTING_AUTO_POST=true).
    // A creditToStoreCredit refund moves no cash — the journal entry
    // credits customer deposits (the new liability) instead of the
    // payment-gateway account, which would fabricate a cash refund.
    await autoPostRefund(orderId, refundAmount, { toStoreCredit: creditToStoreCredit === true });

    // Affiliate clawback: a FULL refund voids the order's commission (the
    // affiliate no longer earned that sale). Best-effort, never throws —
    // refunds must not fail because of the affiliate ledger. Partial
    // refunds leave the commission alone (admins can void manually).
    if (isFullRefund) {
      await voidCommissionForOrder(orderId);
    }

    // Fire-and-forget: email the customer that their order was refunded.
    // Never fails the refund. Reports the actual amount refunded this time.
    // A creditToStoreCredit refund says "store credit added", not "money
    // on its way back to your payment method" — nothing left in cash.
    await notifyRefundIssued(orderId, reason, refundAmount, creditToStoreCredit === true).catch(() => {});

    logger.info(
      `Refund ${isFullRefund ? 'full' : 'partial'} processed for order ${order.orderNumber} (${refundAmount})`,
    );

    res.json({
      status: 'success',
      data: refund,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/order/:orderId - Get payments for order
router.get('/order/:orderId', authenticate, async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.userId !== req.user?.id && req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const payments = await prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: payments,
    });
  } catch (error) {
    next(error);
  }
});

export default router;