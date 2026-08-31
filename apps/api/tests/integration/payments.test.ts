/**
 * Payments integration tests.
 *
 * Notable paths:
 *   - /process refuses a customer unless PAYMENTS_ALLOW_MOCK=true
 *   - already-paid orders are rejected
 *   - the order's payment status is updated to 'completed'
 *   - /refund sets the order to 'refunded'
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createOrder } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/payments (admin)', () => {
  it('lists payments (empty by default)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/payments').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a non-admin (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/payments').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/payments/process', () => {
  it('returns 501 for a customer (mock payments disabled)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: o.id, paymentMethod: 'stripe' });
    expect(res.status).toBe(501);
  });

  it('lets an admin settle a payment', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, paymentMethod: 'stripe' });
    expect(res.status).toBe(200);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after?.paymentStatus).toBe('completed');
  });

  it('rejects an already-paid order (400)', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed' });
    const res = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/refund (admin)', () => {
  it('refunds a paid order', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed' });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, reason: 'customer request' });
    expect(res.status).toBe(200);
  });

  it('rejects an unpaid order (400)', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id });
    expect(res.status).toBe(400);
  });

  it('rejects a non-admin (403)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed' });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: o.id });
    expect(res.status).toBe(403);
  });

  it('refuses to mark a gateway order refunded when the gateway is not enabled (400)', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed' });
    await mockPrisma.order.update({ where: { id: o.id }, data: { paymentMethod: 'paypal' } });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, reason: 'return' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enabled/i);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('completed'); // NOT flipped to refunded
  });

  it('refuses to refund an IDPay order (no API refund), leaving it completed', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed' });
    await mockPrisma.order.update({ where: { id: o.id }, data: { paymentMethod: 'idpay' } });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not expose an API for refunds/i);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('completed');
  });

  it('a partial refund sets paymentStatus to partially_refunded and keeps status', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed', status: 'processing', totalAmount: 110 });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, amount: 10, reason: 'partial return' });
    expect(res.status).toBe(200);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('partially_refunded');
    expect(after!.status).toBe('processing'); // fulfilment state unchanged
  });

  it('refunding the remaining balance flips a partially_refunded order to refunded', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed', status: 'processing', totalAmount: 110 });
    await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, amount: 10 });
    await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, amount: 100 });
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('refunded');
    expect(after!.status).toBe('refunded');
  });

  it('rejects a refund larger than the remaining balance (400)', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed', totalAmount: 110 });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, amount: 200 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exceeds/i);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('completed');
  });

  it('rejects a second full refund once nothing remains (400)', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed', totalAmount: 110 });
    await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, amount: 110 });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id });
    // A fully-refunded order is no longer refundable: the route rejects it
    // (either via the status guard or the nothing-left check).
    expect(res.status).toBe(400);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('refunded');
  });
});

describe('GET /api/payments/order/:orderId', () => {
  it('returns the payments for the order', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .get(`/api/payments/order/${o.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('forbids another customer (403)', async () => {
    const { user: a } = await authHeader();
    const { token: b } = await authHeader();
    const o = await createOrder(a.id);
    const res = await request(app)
      .get(`/api/payments/order/${o.id}`)
      .set('Authorization', `Bearer ${b}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------
// Stripe Checkout (card payments)
// ---------------------------------------------------------------------
// The stripe config module is mocked: the real SDK is exercised in a
// separate unit test (signature round-trip). Here we verify the
// ORDER FLOW around it: capability flag, card rejection without
// Stripe, session creation on order placement, and webhook settling
// (including idempotency for Stripe's retries).
const stripeMock = vi.hoisted(() => ({
  configured: false,
  stripe: null as any,
  nextEvent: null as any,
  constructEventError: null as any,
  sessions: [] as any[],
}));

// Order placement now dispatches to the hosted-gateway adapter via
// gateway.service.createGatewayPayment (which owns the per-gateway
// HTTP/SDK calls). Stub just that seam so the order-flow test asserts
// the route hands the gateway the order and surfaces its checkoutUrl,
// without touching a real gateway. The adapters themselves are unit
// tested in tests/unit/payments/gateways.test.ts.
const gatewayServiceMock = vi.hoisted(() => ({
  createGatewayPayment: vi.fn(),
}));

vi.mock('../../src/modules/payments/gateway.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/modules/payments/gateway.service')>();
  return { ...mod, createGatewayPayment: gatewayServiceMock.createGatewayPayment };
});

vi.mock('../../src/config/stripe', () => ({
  isStripeConfigured: () => stripeMock.configured,
  getStripe: () => stripeMock.stripe,
}));

beforeEach(() => {
  stripeMock.configured = false;
  stripeMock.stripe = null;
  stripeMock.nextEvent = null;
  stripeMock.constructEventError = null;
  stripeMock.sessions = [];
  gatewayServiceMock.createGatewayPayment.mockReset();
});

describe('Stripe: settings capability flag', () => {
  it('reports stripeEnabled=false when Stripe is not configured', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.data.stripeEnabled).toBe(false);
  });

  it('reports stripeEnabled=true when configured', async () => {
    stripeMock.configured = true;
    const res = await request(app).get('/api/settings');
    expect(res.body.data.stripeEnabled).toBe(true);
  });
});

describe('Stripe: order placement with card', () => {
  async function placeCardOrder(paymentMethod: string, body: Record<string, any> = {}) {
    const { user, token } = await authHeader();
    const cat = (await import('../helpers/factories')).createCategory;
    const createProduct = (await import('../helpers/factories')).createProduct;
    const category = await cat({ slug: 'cat', name: 'Cat' });
    const product = await createProduct({ name: 'Thing', slug: 'thing', price: 10, quantity: 10, categoryId: category.id });
    return request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        shippingAddress: { firstName: 'A', lastName: 'B', address1: '1', city: 'C', state: 'S', zipCode: '00000', country: 'US' },
        paymentMethod,
        ...body,
      });
  }

  it('rejects card payment when the store has no Stripe (400, before the order exists)', async () => {
    const res = await placeCardOrder('card');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enabled/i);
    const orders = await mockPrisma.order.findMany();
    expect(orders).toHaveLength(0);
  });

  it('returns a Stripe Checkout URL when configured and hands the order to the gateway', async () => {
    // Stripe is "configured" through the DB-backed gateway config (the
    // order route checks isGatewayConfigured, not the legacy config/stripe
    // module), so seed it here.
    const gwConfig = JSON.stringify({
      stripe: { enabled: true, secretKey: 'sk_test_x', webhookSecret: 'whsec_x' },
    });
    await mockPrisma.storeSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', paymentGateways: gwConfig },
      update: { paymentGateways: gwConfig },
    });
    gatewayServiceMock.createGatewayPayment.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/test/cs_new',
      reference: 'cs_test_new',
    });
    const res = await placeCardOrder('card');
    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toBe('https://checkout.stripe.com/test/cs_new');
    // The order route delegated to the hosted-gateway adapter with the order.
    expect(gatewayServiceMock.createGatewayPayment).toHaveBeenCalledTimes(1);
    const call = gatewayServiceMock.createGatewayPayment.mock.calls[0][0];
    expect(call.paymentMethod).toBe('card');
    expect(call.order.totalAmount).toBe(res.body.data.totalAmount);
    expect(call.storeCurrency).toBe('USD');
  });

  it('COD orders do not get a checkoutUrl', async () => {
    const res = await placeCardOrder('cod');
    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toBeNull();
  });
});

describe('Stripe: webhook settles the order', () => {
  function makeStripeWebhookStub() {
    return {
      webhooks: {
        constructEvent: (payload: string, sig: string, secret: string) => {
          if (stripeMock.constructEventError) throw new Error(stripeMock.constructEventError);
          return stripeMock.nextEvent;
        },
      },
    };
  }

  it('returns 501 when Stripe is not configured', async () => {
    const res = await request(app)
      .post('/api/payments/webhooks/stripe')
      .set('Stripe-Signature', 't=1,v1=abc')
      .send({ id: 'evt_1', type: 'checkout.session.completed' });
    expect(res.status).toBe(501);
  });

  it('rejects an invalid signature (400) and touches no order state', async () => {
    const { user } = await authHeader();
    const o = await (await import('../helpers/factories')).createOrder(user.id, { paymentStatus: 'pending' });
    stripeMock.configured = true;
    stripeMock.constructEventError = 'signature mismatch';
    stripeMock.stripe = makeStripeWebhookStub();
    const res = await request(app)
      .post('/api/payments/webhooks/stripe')
      .set('Stripe-Signature', 't=1,v1=bad')
      .send({ id: 'evt_1', type: 'checkout.session.completed' });
    expect(res.status).toBe(400);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('pending');
    expect(await mockPrisma.payment.findMany({ where: { orderId: o.id } })).toHaveLength(0);
  });

  it('marks the order paid and records a stripe payment on checkout.session.completed', async () => {
    const { user } = await authHeader();
    const o = await (await import('../helpers/factories')).createOrder(user.id, {
      paymentStatus: 'pending',
      totalAmount: 42.5,
    });
    stripeMock.configured = true;
    stripeMock.stripe = makeStripeWebhookStub();
    stripeMock.nextEvent = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_intent: 'pi_123',
          currency: 'usd',
          metadata: { orderId: o.id },
        },
      },
    };
    const res = await request(app)
      .post('/api/payments/webhooks/stripe')
      .set('Stripe-Signature', 't=1,v1=good')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('completed');
    expect(after!.paymentIntentId).toBe('pi_123');
    const payments = await mockPrisma.payment.findMany({ where: { orderId: o.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].method).toBe('stripe');
    expect(payments[0].status).toBe('completed');
  });

  it('is idempotent: a retried webhook does not create a second payment', async () => {
    const { user } = await authHeader();
    const o = await (await import('../helpers/factories')).createOrder(user.id, {
      paymentStatus: 'pending',
      totalAmount: 10,
    });
    stripeMock.configured = true;
    stripeMock.stripe = makeStripeWebhookStub();
    stripeMock.nextEvent = {
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_2', payment_intent: 'pi_456', currency: 'usd', metadata: { orderId: o.id } } },
    };
    const hit = () =>
      request(app).post('/api/payments/webhooks/stripe').set('Stripe-Signature', 't=1,v1=good').send({});
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200); // Stripe retries on timeout
    const payments = await mockPrisma.payment.findMany({ where: { orderId: o.id } });
    expect(payments).toHaveLength(1);
  });

  it('ignores session completions without order metadata', async () => {
    const { user } = await authHeader();
    const o = await (await import('../helpers/factories')).createOrder(user.id, { paymentStatus: 'pending' });
    stripeMock.configured = true;
    stripeMock.stripe = makeStripeWebhookStub();
    stripeMock.nextEvent = {
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_3', payment_intent: 'pi_789', currency: 'usd', metadata: {} } },
    };
    const res = await request(app)
      .post('/api/payments/webhooks/stripe')
      .set('Stripe-Signature', 't=1,v1=good')
      .send({});
    expect(res.status).toBe(200);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after!.paymentStatus).toBe('pending');
  });
});
