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
import { verifyAndSettleGatewayPayment } from './gateway.service';
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

  await prisma.payment.create({
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

  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: 'completed',
      paymentIntentId: stripePaymentId,
      status: 'processing',
    },
  });

  // Best-effort: when ACCOUNTING_AUTO_POST=true, post the sale entry. Never
  // throws, so a posting hiccup cannot fail the (idempotent) webhook.
  await autoPostOrder(orderId);

  logger.info(`Stripe settled order ${order.orderNumber} via checkout session ${session.id}`);
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

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

    if (order.paymentStatus === 'completed') {
      throw new AppError('Order already paid', 400);
    }

    // Mock payment processing
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount: order.totalAmount,
        currency: 'USD',
        method: paymentMethod || 'stripe',
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
    const { orderId, amount, reason } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.paymentStatus !== 'completed') {
      throw new AppError('Order payment not completed', 400);
    }

    // Create refund payment record
    const refund = await prisma.payment.create({
      data: {
        orderId,
        amount: amount || order.totalAmount,
        currency: 'USD',
        method: 'refund',
        status: 'completed',
        transactionId: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        gatewayResponse: JSON.stringify({
          success: true,
          reason,
          originalTransaction: order.paymentIntentId,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    // Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'refunded',
        status: 'refunded',
      },
    });

    // Best-effort auto-posting of the refund (ACCOUNTING_AUTO_POST=true).
    await autoPostRefund(orderId, amount || order.totalAmount);

    logger.info(`Refund processed for order ${order.orderNumber}`);

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