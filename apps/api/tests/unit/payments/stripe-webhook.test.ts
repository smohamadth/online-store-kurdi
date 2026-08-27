/**
 * Stripe webhook signature verification - the real SDK, offline.
 *
 * constructEvent is the only thing standing between a random internet
 * POST /api/payments/webhooks/stripe and "your order is paid", so this
 * test exercises the actual crypto (not a mock): a header generated
 * with stripe.webhooks.generateTestHeaderString must verify with the
 * same secret and fail with any other.
 */
import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';

const stripe = new Stripe('sk_test_unit_test_key');
const SECRET = 'whsec_unit_test_secret';

function makePayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'evt_123',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        payment_intent: 'pi_1',
        currency: 'usd',
        metadata: { orderId: 'order-1' },
        ...overrides,
      },
    },
    ...overrides,
  });
}

describe('stripe.webhooks.constructEvent (real SDK)', () => {
  it('verifies a header signed with the configured secret', () => {
    const payload = makePayload();
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const event = stripe.webhooks.constructEvent(payload, header, SECRET);
    expect(event.type).toBe('checkout.session.completed');
    const session = event.data.object as any;
    expect(session.metadata.orderId).toBe('order-1');
  });

  it('rejects the same payload signed with a different secret', () => {
    const payload = makePayload();
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other_store' });
    expect(() => stripe.webhooks.constructEvent(payload, header, SECRET)).toThrowError(
      /signature/i
    );
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const payload = makePayload();
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    // Attacker rewrites the order id to someone else's order.
    const tampered = payload.replace('order-1', 'order-victim');
    expect(() => stripe.webhooks.constructEvent(tampered, header, SECRET)).toThrowError(
      /signature/i
    );
  });

  it('rejects a missing signature header', () => {
    const payload = makePayload();
    expect(() => stripe.webhooks.constructEvent(payload, '', SECRET)).toThrowError();
  });
});
