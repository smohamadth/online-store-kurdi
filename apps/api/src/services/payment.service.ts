// ---------------------------------------------------------------------------
// Stripe payment service.
//
// STATUS: DEAD CODE. Nothing imports this file anymore - the live Stripe
// path is config/stripe.ts (getStripe / isStripeConfigured), called
// directly from modules/orders/order.routes.ts (checkout session creation)
// and modules/payments/payment.routes.ts (payment intents, webhook). It was
// kept because deleting it would churn the git blame of the payment
// history; if you are touching payments, start from config/stripe.ts.
//
// What it does do (for the record): mock-mode fallbacks when no API key is
// set, PaymentIntent create/confirm, refunds, webhook dispatch, and the
// payment_intent.succeeded / payment_failed order updates.
// ---------------------------------------------------------------------------
import Stripe from 'stripe';
import { env } from '../config/environment';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { createCommissionForOrder } from '../modules/affiliates/affiliate.service';

// Initialize Stripe (never called - see header; initializeStripe() is a
// leftover of the pre-config/stripe.ts architecture)
let stripe: Stripe | null = null;

export function initializeStripe(): void {
  if (env.STRIPE_SECRET_KEY) {
    // No explicit apiVersion: stripe >= v10 pins the API version to the
    // installed package, and passing a stale one is a type error (and a
    // request-time failure) rather than a way to "freeze" behaviour.
    stripe = new Stripe(env.STRIPE_SECRET_KEY);
    logger.info('✅ Stripe initialized');
  } else {
    logger.warn('⚠️ Stripe not configured - payments will be mocked');
  }
}

// Create payment intent. Mock mode returns a fake client secret so the
// checkout flow can be exercised end-to-end with no Stripe account.
export async function createPaymentIntent(
  orderId: string,
  amount: number,
  currency: string = 'usd',
  metadata?: Record<string, string>
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  try {
    if (!stripe) {
      // Mock payment intent
      const mockId = `pi_mock_${Date.now()}`;
      logger.info(`Mock payment intent created: ${mockId}`);
      return {
        clientSecret: `${mockId}_secret_mock`,
        paymentIntentId: mockId,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata: {
        orderId,
        ...metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    logger.info(`Payment intent created: ${paymentIntent.id} for order ${orderId}`);

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    logger.error('Failed to create payment intent:', error);
    throw error;
  }
}

// Confirm payment
export async function confirmPayment(
  paymentIntentId: string
): Promise<{ success: boolean; status: string }> {
  try {
    if (!stripe) {
      // Mock confirmation
      logger.info(`Mock payment confirmed: ${paymentIntentId}`);
      return { success: true, status: 'succeeded' };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return {
      success: paymentIntent.status === 'succeeded',
      status: paymentIntent.status,
    };
  } catch (error) {
    logger.error('Failed to confirm payment:', error);
    throw error;
  }
}

// Create refund
export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  reason?: string
): Promise<{ success: boolean; refundId: string }> {
  try {
    if (!stripe) {
      // Mock refund
      const mockId = `re_mock_${Date.now()}`;
      logger.info(`Mock refund created: ${mockId}`);
      return { success: true, refundId: mockId };
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amount ? Math.round(amount * 100) : undefined,
      reason: reason as any,
    });

    logger.info(`Refund created: ${refund.id} for payment ${paymentIntentId}`);

    return {
      success: true,
      refundId: refund.id,
    };
  } catch (error) {
    logger.error('Failed to create refund:', error);
    throw error;
  }
}

// Handle webhook - verify the Stripe-Signature header before trusting any
// event (constructEvent throws on a bad signature, which is the security
// boundary: an unverified caller can never move an order to "paid").
export async function handleWebhook(
  payload: Buffer,
  signature: string
): Promise<{ type: string; data: any }> {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe not configured');
  }

  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    env.STRIPE_WEBHOOK_SECRET
  );

  logger.info(`Stripe webhook received: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentSuccess(paymentIntent);
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object as Stripe.PaymentIntent;
      await handlePaymentFailure(failedPayment);
      break;
  }

  return { type: event.type, data: event.data.object };
}

// Handle successful payment. Order + payment row are written in two
// statements (not a transaction): if the create fails, the order is still
// marked paid, so the webhook's caller must treat a 200 as "event seen"
// and rely on the Payment row as the audit trail.
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const orderId = paymentIntent.metadata.orderId;

  if (!orderId) {
    // Webhook events for intents that were never tied to one of our orders
    // (e.g. a payment test from the Stripe dashboard).
    logger.warn('No orderId in payment intent metadata');
    return;
  }

  try {
    // Update order payment status ('processing' because the store still has
    // to pick/pack - the order lifecycle continues in order.routes)
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'completed',
        paymentIntentId: paymentIntent.id,
        status: 'processing',
      },
    });

    // Create payment record
    await prisma.payment.create({
      data: {
        orderId,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        method: 'stripe',
        status: 'completed',
        transactionId: paymentIntent.id,
        gatewayResponse: JSON.stringify(paymentIntent),
      },
    });

    // Best-effort affiliate commission for referred orders (idempotent on
    // orderId; never throws — the webhook must stay replay-safe).
    await createCommissionForOrder(orderId);

    logger.info(`Payment succeeded for order ${orderId}`);
  } catch (error) {
    logger.error(`Failed to handle payment success for order ${orderId}:`, error);
  }
}

// Handle failed payment
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const orderId = paymentIntent.metadata.orderId;

  if (!orderId) {
    logger.warn('No orderId in payment intent metadata');
    return;
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'failed',
      },
    });

    logger.info(`Payment failed for order ${orderId}`);
  } catch (error) {
    logger.error(`Failed to handle payment failure for order ${orderId}:`, error);
  }
}

// Get payment methods for customer
export async function getPaymentMethods(customerId: string): Promise<any[]> {
  if (!stripe) {
    return [];
  }

  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    return paymentMethods.data;
  } catch (error) {
    logger.error('Failed to get payment methods:', error);
    return [];
  }
}

// Create Stripe customer
export async function createCustomer(
  email: string,
  name: string,
  metadata?: Record<string, string>
): Promise<string> {
  if (!stripe) {
    return `cus_mock_${Date.now()}`;
  }

  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata,
    });

    logger.info(`Stripe customer created: ${customer.id}`);
    return customer.id;
  } catch (error) {
    logger.error('Failed to create Stripe customer:', error);
    throw error;
  }
}

export default {
  initializeStripe,
  createPaymentIntent,
  confirmPayment,
  createRefund,
  handleWebhook,
  getPaymentMethods,
  createCustomer,
};