// ---------------------------------------------------------------------------
// Stripe — card payments via Stripe Checkout (hosted payment page).
//
// The store has shipped a Stripe integration (config/stripe.ts + the
// checkout.session.completed webhook) that reads keys from env vars. This
// adapter reuses that same integration but lets the admin configure the keys
// in the DB (StoreSettings.paymentGateways.stripe) instead of only .env.
// `stripeConfigured()` returns true when either source has keys.
//
//   create: POST /v1/checkout/sessions (hosted page)
//   verify: GET  /v1/checkout/sessions/:id -> payment_status
//
// The order is normally settled by the existing webhook; `verifyPayment`
// is a fallback so the storefront can confirm a return when no webhook
// fires (e.g. local dev).
// ---------------------------------------------------------------------------
import Stripe from 'stripe';
import type { GatewayDefinition, GatewayContext } from './types';

function clientFor(secret: string): Stripe {
  return new Stripe(secret);
}

export const stripe: GatewayDefinition = {
  id: 'stripe',
  name: 'Stripe',
  label: 'Credit / Debit Card',
  country: 'global',
  description:
    'International card payments via Stripe Checkout. Enter your Stripe secret key and webhook signing secret.',
  fields: [
    { key: 'secretKey', label: 'Secret Key', type: 'password', required: true, secret: true, help: 'stripe > Developers > API keys > Secret key (sk_...).' },
    { key: 'webhookSecret', label: 'Webhook Signing Secret', type: 'password', required: true, secret: true, help: 'stripe > Developers > Webhooks > Signing secret (whsec_...). Used to verify checkout.session.completed events.' },
    { key: 'publishableKey', label: 'Publishable Key (optional)', type: 'text', secret: true, help: 'Not required for server-side checkout; used for client hints.' },
  ],
  async createPayment(ctx: GatewayContext) {
    const secretKey = String(ctx.config.secretKey || '');
    if (!secretKey) throw new Error('Stripe secret key is not configured');
    const stripe = clientFor(secretKey);
    const currency = (ctx.order.currency || 'USD').toLowerCase();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(ctx.order.totalAmount * 100),
            product_data: { name: `Order ${ctx.order.orderNumber}` },
          },
        },
      ],
      metadata: { orderId: ctx.order.id, orderNumber: ctx.order.orderNumber },
      success_url: ctx.returnUrl,
      cancel_url: ctx.cancelUrl,
    });
    if (!session.id || !session.url) {
      throw new Error('Stripe did not return a checkout session url.');
    }
    return { checkoutUrl: session.url, reference: session.id, extra: { sessionId: session.id } };
  },
  async verifyPayment(ctx: GatewayContext, params: Record<string, string>) {
    const secretKey = String(ctx.config.secretKey || '');
    if (!secretKey) return { success: false, message: 'Stripe secret key is not configured.' };
    const sessionId = params.session_id || ctx.reference;
    if (!sessionId) return { success: false, message: 'Missing Stripe session id.' };
    try {
      const session = await clientFor(secretKey).checkout.sessions.retrieve(sessionId);
      const paid = session.payment_status === 'paid';
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.id;
      return {
        success: paid,
        transactionId: paid ? paymentIntentId : null,
        reference: sessionId,
        message: paid ? 'Stripe payment confirmed.' : `Stripe payment_status: ${session.payment_status}.`,
        raw: { payment_status: session.payment_status },
      };
    } catch (err) {
      return { success: false, message: `Stripe verify failed: ${(err as Error).message}`, reference: sessionId };
    }
  },
};
