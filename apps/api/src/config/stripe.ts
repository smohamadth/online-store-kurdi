import Stripe from 'stripe';
import { env } from './environment';

/**
 * Stripe client (optional).
 *
 * The store ships without a payment gateway: checkout offers cash on
 * delivery and bank transfer, which staff settle via POST
 * /api/payments/process. When the merchant puts STRIPE_SECRET_KEY +
 * STRIPE_WEBHOOK_SECRET into .env, card payments switch on: the
 * storefront shows the card option, order placement creates a Stripe
 * Checkout session, and the webhook settles the order. Everything
 * degrades to the offline flow when the keys are absent.
 */
let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/** The shared client, or null when no secret key is configured. */
export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!client) client = new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}
