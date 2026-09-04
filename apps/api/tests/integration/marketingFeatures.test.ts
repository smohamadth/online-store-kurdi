/**
 * Bundles, conversion funnel, and email capture - end to end.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

async function twoProducts() {
  const a = await createProduct({ price: 60, quantity: 10, sku: 'BND-A', slug: 'bnd-a', name: 'Widget' });
  const b = await createProduct({ price: 40, quantity: 10, sku: 'BND-B', slug: 'bnd-b', name: 'Gadget' });
  return { a, b };
}

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------
describe('POST /api/bundles', () => {
  it('creates a bundle and returns computed pricing', async () => {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });

    const res = await request(app)
      .post('/api/bundles')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Starter Kit',
        discountType: 'percentage',
        discountValue: 25,
        items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.itemsTotal).toBe(100);
    expect(res.body.data.bundlePrice).toBe(75);
    expect(res.body.data.savings).toBe(25);
    expect(res.body.data.slug).toBe('starter-kit');
  });

  it('requires an admin', async () => {
    const { a, b } = await twoProducts();
    const { token } = await authHeader();
    await request(app)
      .post('/api/bundles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }] })
      .expect(403);
  });

  it('rejects a bundle with fewer than two products', async () => {
    // A one-item "bundle" is just a discounted product; allowing it makes the
    // savings display meaningless.
    const { a } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/bundles')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Solo', items: [{ productId: a.id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('rejects the same product listed twice', async () => {
    const { a } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/bundles')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Dupe', items: [{ productId: a.id, quantity: 1 }, { productId: a.id, quantity: 2 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/same product twice/i);
  });

  it('rejects a bundle referencing a product that does not exist', async () => {
    // Otherwise the bundle silently prices at 0.
    const { a } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/bundles')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Ghost', items: [{ productId: a.id, quantity: 1 }, { productId: 'nope', quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('refuses a duplicate slug', async () => {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    const body = {
      name: 'Kit', items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
    };
    await request(app).post('/api/bundles').set('Authorization', `Bearer ${admin.token}`).send(body).expect(201);
    const res = await request(app).post('/api/bundles').set('Authorization', `Bearer ${admin.token}`).send(body);
    expect(res.status).toBe(409);
  });
});

describe('GET /api/bundles', () => {
  async function makeBundle(over: Record<string, unknown> = {}) {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/bundles')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Combo', discountType: 'fixed', discountValue: 80,
        items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
        ...over,
      });
    return { res, a, b, admin };
  }

  it('is public', async () => {
    await makeBundle();
    const res = await request(app).get('/api/bundles');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('reprices from CURRENT product prices, not a stored snapshot', async () => {
    // A stale bundle price after a catalogue price rise would undercut the
    // store indefinitely.
    const { a } = await makeBundle({ discountType: 'percentage', discountValue: 10 });
    await mockPrisma.product.update({ where: { id: a.id }, data: { price: 160 } });

    const res = await request(app).get('/api/bundles');
    expect(res.body.data[0].itemsTotal).toBe(200);   // 160 + 40
    expect(res.body.data[0].bundlePrice).toBe(180);  // 10% off
  });

  it('hides inactive bundles', async () => {
    await makeBundle({ isActive: false });
    const res = await request(app).get('/api/bundles');
    expect(res.body.data).toHaveLength(0);
  });

  it('reports availability from component stock', async () => {
    const { a } = await makeBundle();
    let res = await request(app).get('/api/bundles');
    expect(res.body.data[0].available).toBe(true);

    await mockPrisma.product.update({ where: { id: a.id }, data: { quantity: 0 } });
    res = await request(app).get('/api/bundles');
    expect(res.body.data[0].available).toBe(false);
  });

  it('404s an unknown or inactive slug', async () => {
    await makeBundle({ isActive: false, name: 'Hidden' });
    await request(app).get('/api/bundles/hidden').expect(404);
    await request(app).get('/api/bundles/never-existed').expect(404);
  });
});

// ---------------------------------------------------------------------------
// Conversion funnel
// ---------------------------------------------------------------------------
describe('GET /api/analytics/funnel', () => {
  // The session identity comes from the x-session-id HEADER (see
  // sessionIdHeader in analytics.controller), not the body - sending it in
  // the body gives every event a distinct fallback id.
  async function track(eventType: string, sessionId: string) {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
    // purchase is server-only (public /track rejects it so conversion
    // cannot be spoofed). Write it the same way order creation does.
    if (eventType === 'purchase') {
      await mockPrisma.userEvent.create({
        data: { eventType: 'purchase', sessionId, metadata: '{}' },
      });
      return;
    }
    await request(app)
      .post('/api/analytics/track')
      .set('x-session-id', sessionId)
      .send({ eventType });
  }

  it('requires admin or manager', async () => {
    const { token } = await authHeader();
    await request(app).get('/api/analytics/funnel').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('reports zeroes on an empty store instead of NaN', async () => {
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/analytics/funnel').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stages).toHaveLength(4);
    for (const s of res.body.data.stages) expect(s.count).toBe(0);
    expect(res.body.data.biggestDropOff).toBeNull();
  });

  it('builds the funnel from tracked events', async () => {
    for (const s of ['s1', 's2', 's3', 's4']) await track('view', s);
    for (const s of ['s1', 's2']) await track('add_to_cart', s);
    await track('begin_checkout', 's1');
    await track('purchase', 's1');

    const admin = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/analytics/funnel').set('Authorization', `Bearer ${admin.token}`);

    const counts = Object.fromEntries(res.body.data.stages.map((s: any) => [s.step, s.count]));
    expect(counts).toEqual({ view: 4, add_to_cart: 2, begin_checkout: 1, purchase: 1 });
    expect(res.body.data.biggestDropOff.step).toBe('add_to_cart');
    delete process.env.ANALYTICS_TRACKING_ENABLED;
  });

  it('counts unique visitors, not raw events', async () => {
    // One shopper reloading a page 5 times is one person in the funnel;
    // counting events would make every conversion rate look terrible.
    for (let i = 0; i < 5; i++) await track('view', 'same-session');

    const admin = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/analytics/funnel').set('Authorization', `Bearer ${admin.token}`);
    const view = res.body.data.stages.find((s: any) => s.step === 'view');
    expect(view.count).toBe(1);
    delete process.env.ANALYTICS_TRACKING_ENABLED;
  });
});

// ---------------------------------------------------------------------------
// Email capture
// ---------------------------------------------------------------------------
describe('POST /api/marketing/capture', () => {
  it('records the capture and subscribes with consent', async () => {
    const res = await request(app)
      .post('/api/marketing/capture')
      .send({ email: 'Popup@Example.com', trigger: 'exit_intent' });
    expect(res.status).toBe(201);

    const captures = await mockPrisma.emailCapture.findMany({});
    expect(captures).toHaveLength(1);
    expect(captures[0].email).toBe('popup@example.com');

    // A captured address must be as unsubscribable as any other, or we have
    // recreated the unmailable-list problem.
    const sub = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: 'popup@example.com' },
    });
    expect(sub.status).toBe('subscribed');
    expect(sub.source).toBe('popup');
    expect(sub.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
    expect(sub.consentAt).toBeTruthy();
  });

  it('rejects a malformed address', async () => {
    await request(app).post('/api/marketing/capture').send({ email: 'not-an-email' }).expect(400);
  });

  it('does not duplicate an existing subscriber', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'dual@x.com' }).expect(200);
    await request(app).post('/api/marketing/capture').send({ email: 'dual@x.com' }).expect(201);

    const subs = await mockPrisma.newsletterSubscriber.findMany({});
    expect(subs.filter((s: any) => s.email === 'dual@x.com')).toHaveLength(1);
  });

  it('re-subscribes someone who had opted out (fresh consent)', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'return@x.com' }).expect(200);
    const first = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'return@x.com' } });
    await request(app).get(`/api/newsletter/unsubscribe?token=${first.unsubscribeToken}`).expect(200);

    await request(app).post('/api/marketing/capture').send({ email: 'return@x.com' }).expect(201);
    const after = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'return@x.com' } });
    expect(after.status).toBe('subscribed');
    expect(after.unsubscribeToken).not.toBe(first.unsubscribeToken);
  });

  it('exposes capture stats to admins only', async () => {
    await request(app).post('/api/marketing/capture').send({ email: 'a@x.com', trigger: 'timed' });
    await request(app).post('/api/marketing/capture').send({ email: 'b@x.com', trigger: 'exit_intent' });

    const { token } = await authHeader();
    await request(app).get('/api/marketing/capture/stats').set('Authorization', `Bearer ${token}`).expect(403);

    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/marketing/capture/stats')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.byTrigger).toEqual({ timed: 1, exit_intent: 1 });
  });
});
