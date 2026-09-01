/**
 * Integration tests for the affiliate marketing program.
 *
 *   POST /api/affiliates/track                     (public)
 *   POST /api/affiliates/apply                     (auth)
 *   GET  /api/affiliates/me                        (auth)
 *   GET  /api/affiliates/me/commissions            (auth)
 *   GET  /api/affiliates/me/clicks                 (auth)
 *   GET  /api/affiliates/me/payouts                (auth)
 *   POST /api/affiliates/me/payouts                (auth)
 *   GET  /api/affiliates                           (admin)
 *   POST /api/affiliates/:id/approve|suspend       (admin)
 *   PUT  /api/affiliates/:id/rate                  (admin)
 *   GET  /api/affiliates/commissions               (admin)
 *   POST /api/affiliates/commissions/:id/approve|reject (admin)
 *   GET  /api/affiliates/payouts                   (admin)
 *   POST /api/affiliates/payouts/:id/approve|reject (admin)
 *
 * Plus the cross-module hooks: order placement captures the aff_ref cookie,
 * and settling a payment creates the commission (idempotently).
 *
 * Program switch lives on the singleton StoreSettings row
 * (affiliateEnabled / affiliateRate).
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

/** Enable the program with a given default rate. */
async function enableProgram(rate = 10): Promise<void> {
  await mockPrisma.storeSettings.create({
    data: { id: 'default', affiliateEnabled: true, affiliateRate: rate, currency: 'USD' },
  });
}

async function disableProgram(): Promise<void> {
  await mockPrisma.storeSettings.create({
    data: { id: 'default', affiliateEnabled: false, affiliateRate: 10, currency: 'USD' },
  });
}

/**
 * Full setup: program on, a customer joins and is approved, an admin token
 * is minted. Returns everything a test needs.
 */
async function approvedAffiliate(rate = 10) {
  await enableProgram(rate);
  const admin = await authHeader({ role: 'admin' });
  const affiliate = await authHeader({ role: 'customer' });
  const apply = await request(app)
    .post('/api/affiliates/apply')
    .set('Authorization', `Bearer ${affiliate.token}`)
    .send({});
  expect(apply.status).toBe(201);
  const approve = await request(app)
    .post(`/api/affiliates/${apply.body.data.id}/approve`)
    .set('Authorization', `Bearer ${admin.token}`);
  expect(approve.status).toBe(200);
  expect(approve.body.data.status).toBe('active');
  return {
    admin: admin.token,
    affiliate: affiliate.token,
    affiliateUser: affiliate.user,
    profile: apply.body.data,
    code: apply.body.data.code as string,
    affiliateId: apply.body.data.id as string,
  };
}

/**
 * Place a real order through POST /api/orders with an optional ref cookie.
 * The buyer is a fresh customer (attribution is per-browser, not per-user,
 * so any logged-in buyer works).
 */
async function placeOrder(opts: { refCookie?: string; price?: number } = {}) {
  const buyer = await authHeader({ role: 'customer' });
  const p = await createProduct({ price: opts.price ?? 100, quantity: 50 });
  await mockPrisma.cartItem.create({ data: { userId: buyer.user.id, productId: p.id, quantity: 1 } });
  let req = request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ items: [{ productId: p.id, quantity: 1 }] });
  if (opts.refCookie) req = req.set('Cookie', opts.refCookie);
  const res = await req;
  expect(res.status).toBe(201);
  return res.body.data as { id: string; orderNumber: string; totalAmount: number };
}

/** Settle an order's payment as admin (the COD/bank-transfer path). */
async function settleOrder(adminToken: string, orderId: string) {
  const res = await request(app)
    .post('/api/payments/process')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ orderId, paymentMethod: 'stripe' });
  expect(res.status).toBe(200);
  return res.body.data;
}

// =====================================================================
// Auth & authorization
// =====================================================================

describe('Auth & authorization', () => {
  it('track is public (no auth required)', async () => {
    await enableProgram();
    const res = await request(app).post('/api/affiliates/track').send({ code: 'NOPE-1234' });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
  });

  it('apply requires auth (401)', async () => {
    const res = await request(app).post('/api/affiliates/apply').send({});
    expect(res.status).toBe(401);
  });

  it('admin endpoints reject customers (403)', async () => {
    const { affiliate } = await approvedAffiliate();
    const paths = [
      { method: 'get' as const, url: '/api/affiliates' },
      { method: 'get' as const, url: '/api/affiliates/commissions' },
      { method: 'get' as const, url: '/api/affiliates/payouts' },
      { method: 'post' as const, url: `/api/affiliates/${'aff1'}/approve` },
      { method: 'post' as const, url: `/api/affiliates/commissions/${'c1'}/approve` },
      { method: 'post' as const, url: `/api/affiliates/payouts/${'p1'}/approve` },
    ];
    for (const { method, url } of paths) {
      const res = await request(app)[method](url).set('Authorization', `Bearer ${affiliate}`);
      expect(res.status).toBe(403);
    }
  });
});

// =====================================================================
// Applications
// =====================================================================

describe('POST /api/affiliates/apply', () => {
  it('refuses when the program is disabled', async () => {
    await disableProgram();
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/affiliates/apply')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enabled/i);
  });

  it('creates a pending profile with a referral code', async () => {
    await enableProgram();
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/affiliates/apply')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.code).toMatch(/^[A-Z0-9-]{2,24}$/);
  });

  it('refuses a duplicate application', async () => {
    await enableProgram();
    const { token } = await authHeader();
    await request(app).post('/api/affiliates/apply').set('Authorization', `Bearer ${token}`).send({});
    const res = await request(app)
      .post('/api/affiliates/apply')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already applied/i);
  });

  it('is per-user: two users each get their own code', async () => {
    await enableProgram();
    const a = await authHeader();
    const b = await authHeader();
    const ra = await request(app).post('/api/affiliates/apply').set('Authorization', `Bearer ${a.token}`).send({});
    const rb = await request(app).post('/api/affiliates/apply').set('Authorization', `Bearer ${b.token}`).send({});
    expect(ra.status).toBe(201);
    expect(rb.status).toBe(201);
    expect(ra.body.data.code).not.toBe(rb.body.data.code);
  });
});

// =====================================================================
// Admin approval / suspension / rate
// =====================================================================

describe('Admin affiliate management', () => {
  it('approves, suspends, and lists affiliates with the user identity', async () => {
    await enableProgram();
    const admin = await authHeader({ role: 'admin' });
    const { token } = await authHeader({ role: 'customer' });
    const apply = await request(app).post('/api/affiliates/apply').set('Authorization', `Bearer ${token}`).send({});
    const id = apply.body.data.id;

    const approve = await request(app)
      .post(`/api/affiliates/${id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(approve.body.data.status).toBe('active');

    const list = await request(app).get('/api/affiliates').set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].user.email).toBeTruthy();
    expect(list.body.data[0].status).toBe('active');

    const suspend = await request(app)
      .post(`/api/affiliates/${id}/suspend`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(suspend.body.data.status).toBe('suspended');
  });

  it('sets a per-affiliate rate override', async () => {
    const { admin, affiliateId } = await approvedAffiliate();
    const res = await request(app)
      .put(`/api/affiliates/${affiliateId}/rate`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ rateOverride: 20 });
    expect(res.status).toBe(200);
    expect(res.body.data.rateOverride).toBe(20);
  });

  it('clears the override with null (back to store default)', async () => {
    const { admin, affiliateId } = await approvedAffiliate();
    const res = await request(app)
      .put(`/api/affiliates/${affiliateId}/rate`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ rateOverride: null });
    expect(res.status).toBe(200);
    expect(res.body.data.rateOverride).toBeNull();
  });

  it('rejects a nonsense rate', async () => {
    const { admin, affiliateId } = await approvedAffiliate();
    const res = await request(app)
      .put(`/api/affiliates/${affiliateId}/rate`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ rateOverride: 250 });
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// Click tracking + attribution cookie
// =====================================================================

describe('POST /api/affiliates/track', () => {
  it('records a click and sets the aff_ref cookie for a valid active code', async () => {
    const { code } = await approvedAffiliate();
    const res = await request(app).post('/api/affiliates/track').send({ code });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const affCookie = setCookie.find((c) => c.startsWith('aff_ref='));
    expect(affCookie).toBeTruthy();
    expect(affCookie).toContain(encodeURIComponent(code));
    expect(affCookie).toContain('Max-Age=2592000'); // 30 days

    const profile = await mockPrisma.affiliate.findUnique({ where: { code } });
    expect(profile?.clicks).toBe(1);
    const clicks = await mockPrisma.affiliateClick.findMany({ where: { affiliateId: profile!.id } });
    expect(clicks).toHaveLength(1);
    // IP is stored hashed, never raw.
    expect(clicks[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers valid:false for an unknown code WITHOUT a cookie', async () => {
    const { code } = await approvedAffiliate();
    const res = await request(app).post('/api/affiliates/track').send({ code: 'NOPE-9999' });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.headers['set-cookie']).toBeUndefined();
    // The real affiliate is untouched (mock store has no column defaults,
    // so an untouched clicks counter reads undefined — same as 0).
    const profile = await mockPrisma.affiliate.findUnique({ where: { code } });
    expect(Number(profile?.clicks ?? 0)).toBe(0);
  });

  it('answers valid:false for a suspended affiliate', async () => {
    const { admin, affiliateId, code } = await approvedAffiliate();
    await request(app).post(`/api/affiliates/${affiliateId}/suspend`).set('Authorization', `Bearer ${admin}`);
    const res = await request(app).post('/api/affiliates/track').send({ code });
    expect(res.body.data.valid).toBe(false);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('answers valid:false while the program is disabled', async () => {
    const { code } = await approvedAffiliate();
    await disableProgram();
    const res = await request(app).post('/api/affiliates/track').send({ code });
    expect(res.body.data.valid).toBe(false);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('throttles repeated clicks from the same code+IP (bots cannot inflate)', async () => {
    const { code, affiliateId } = await approvedAffiliate();
    await request(app).post('/api/affiliates/track').send({ code });
    await request(app).post('/api/affiliates/track').send({ code });
    const clicks = await mockPrisma.affiliateClick.findMany({ where: { affiliateId } });
    expect(clicks).toHaveLength(1);
  });
});

// =====================================================================
// Attribution at order placement
// =====================================================================

describe('Order placement attribution', () => {
  it('captures the affiliate from the aff_ref cookie', async () => {
    const { affiliate, code } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    const row = await mockPrisma.order.findUnique({ where: { id: order.id } });
    expect(row?.affiliateCode).toBe(code);
    expect(row?.affiliateId).toBeTruthy();
  });

  it('ignores a missing cookie (no attribution)', async () => {
    const { affiliate } = await approvedAffiliate();
    const order = await placeOrder();
    const row = await mockPrisma.order.findUnique({ where: { id: order.id } });
    expect(row?.affiliateId).toBeNull();
    expect(row?.affiliateCode).toBeNull();
  });

  it('ignores a junk cookie but still creates the order', async () => {
    const { affiliate } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: 'aff_ref=NOPE-9999' });
    const row = await mockPrisma.order.findUnique({ where: { id: order.id } });
    expect(row?.affiliateId).toBeNull();
    expect(order.id).toBeTruthy();
  });

  it('ignores the cookie of a suspended affiliate', async () => {
    const { admin, affiliateId, code, affiliate } = await approvedAffiliate();
    await request(app).post(`/api/affiliates/${affiliateId}/suspend`).set('Authorization', `Bearer ${admin}`);
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    const row = await mockPrisma.order.findUnique({ where: { id: order.id } });
    expect(row?.affiliateId).toBeNull();
  });

  it('ignores the cookie while the program is disabled', async () => {
    const { code, affiliate } = await approvedAffiliate();
    await disableProgram();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    const row = await mockPrisma.order.findUnique({ where: { id: order.id } });
    expect(row?.affiliateId).toBeNull();
  });
});

// =====================================================================
// Commissions on payment
// =====================================================================

describe('Commission creation on payment', () => {
  it('creates a pending commission when a referred order is paid', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);

    const commissions = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    expect(commissions).toHaveLength(1);
    expect(commissions[0].orderId).toBe(order.id);
    expect(commissions[0].orderAmount).toBe(order.totalAmount);
    expect(commissions[0].rate).toBe(10);
    expect(commissions[0].amount).toBe(Math.round(order.totalAmount * 10) / 100);
    expect(commissions[0].status).toBe('pending');
    expect(commissions[0].currency).toBe('USD');
  });

  it('does not create a commission for unreferred orders', async () => {
    const { admin, affiliate } = await approvedAffiliate();
    const order = await placeOrder();
    await settleOrder(admin, order.id);
    const commissions = await mockPrisma.affiliateCommission.findMany({});
    expect(commissions).toHaveLength(0);
  });

  it('never double-pays: the payment layer rejects replays and the commission is unique per order', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);

    // A replayed settlement is refused at the payment layer (the manual
    // path rejects already-paid orders; the gateway/webhook paths dedupe
    // on the transaction id).
    const replay = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: order.id, paymentMethod: 'stripe' });
    expect(replay.status).toBe(400);

    // And the commission is unique per order by construction.
    const commissions = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    expect(commissions).toHaveLength(1);

    // Directly invoking the creator again (the webhook path) must also
    // return the existing row without creating a second one.
    const { createCommissionForOrder } = await import('../../src/modules/affiliates/affiliate.service');
    await createCommissionForOrder(order.id);
    const after = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    expect(after).toHaveLength(1);
  });

  it('uses the per-affiliate rate override when set', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    await request(app)
      .put(`/api/affiliates/${affiliateId}/rate`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ rateOverride: 20 });
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);
    const commissions = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    expect(commissions[0].rate).toBe(20);
    expect(commissions[0].amount).toBe(Math.round(order.totalAmount * 20) / 100);
  });

  it('does not create a commission for an order that is never paid', async () => {
    const { affiliate, code, affiliateId } = await approvedAffiliate();
    await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    const commissions = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    expect(commissions).toHaveLength(0);
  });

  it('does not create a commission when the affiliate is suspended at payment time', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    // Suspend BEFORE the payment settles.
    await request(app).post(`/api/affiliates/${affiliateId}/suspend`).set('Authorization', `Bearer ${admin}`);
    await settleOrder(admin, order.id);
    const commissions = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    expect(commissions).toHaveLength(0);
  });
});

// =====================================================================
// Dashboard (GET /me) + ledger endpoints
// =====================================================================

describe('GET /api/affiliates/me', () => {
  it('reports programEnabled + affiliate null before applying', async () => {
    await enableProgram();
    const { token } = await authHeader();
    const res = await request(app).get('/api/affiliates/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.programEnabled).toBe(true);
    expect(res.body.data.affiliate).toBeNull();
  });

  it('shows stats: clicks, pending earnings, available balance', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();

    // One click + one paid referred order worth 200 => 10% = 20 pending.
    await request(app).post('/api/affiliates/track').send({ code });
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}`, price: 200 });
    await settleOrder(admin, order.id);

    const res = await request(app).get('/api/affiliates/me').set('Authorization', `Bearer ${affiliate}`);
    expect(res.status).toBe(200);
    const { stats } = res.body.data;
    expect(stats.clicks).toBe(1);
    expect(stats.referredOrders).toBe(1);
    expect(stats.pendingCommissions).toBe(1);
    expect(stats.pendingEarnings).toBe(20);
    expect(stats.approvedEarnings).toBe(0);
    expect(stats.paidOut).toBe(0);
    expect(stats.available).toBe(0);
    expect(res.body.data.affiliate.code).toBe(code);
  });

  it('exposes own commissions and clicks lists', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    await request(app).post('/api/affiliates/track').send({ code });
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);

    const commissions = await request(app)
      .get('/api/affiliates/me/commissions')
      .set('Authorization', `Bearer ${affiliate}`);
    expect(commissions.body.data).toHaveLength(1);
    expect(commissions.body.data[0].orderNumber).toBeTruthy();

    const clicks = await request(app).get('/api/affiliates/me/clicks').set('Authorization', `Bearer ${affiliate}`);
    expect(clicks.body.data).toHaveLength(1);

    // A different customer cannot see this affiliate's data.
    const stranger = await authHeader();
    const forbidden = await request(app)
      .get('/api/affiliates/me/commissions')
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(forbidden.status).toBe(404);
  });

  it('admin commission list includes the affiliate identity', async () => {
    const { admin, affiliate, code } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);

    const res = await request(app)
      .get('/api/affiliates/commissions?status=pending')
      .set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].affiliate.user.email).toBeTruthy();
  });
});

// =====================================================================
// Commission approve / reject + balance math
// =====================================================================

describe('Commission resolution + balance', () => {
  it('approving credits totalEarned; rejecting does not', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    const o1 = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    const o2 = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, o1.id);
    await settleOrder(admin, o2.id);

    const all = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    expect(all).toHaveLength(2);

    await request(app)
      .post(`/api/affiliates/commissions/${all[0].id}/approve`)
      .set('Authorization', `Bearer ${admin}`);
    await request(app)
      .post(`/api/affiliates/commissions/${all[1].id}/reject`)
      .set('Authorization', `Bearer ${admin}`);

    const profile = await mockPrisma.affiliate.findUnique({ where: { id: affiliateId } });
    expect(profile?.totalEarned).toBe(Math.round(o1.totalAmount * 10) / 100);

    const stats = await request(app).get('/api/affiliates/me').set('Authorization', `Bearer ${affiliate}`);
    expect(stats.body.data.stats.approvedEarnings).toBe(profile?.totalEarned);
    expect(stats.body.data.stats.pendingCommissions).toBe(0);
    expect(stats.body.data.stats.available).toBe(profile?.totalEarned);
  });

  it('refuses to approve an already-resolved commission', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);
    const [commission] = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    await request(app)
      .post(`/api/affiliates/commissions/${commission.id}/approve`)
      .set('Authorization', `Bearer ${admin}`);
    const again = await request(app)
      .post(`/api/affiliates/commissions/${commission.id}/approve`)
      .set('Authorization', `Bearer ${admin}`);
    expect(again.status).toBe(400);
  });
});

// =====================================================================
// Payouts
// =====================================================================

describe('Payouts', () => {
  it('refuses a payout request with nothing approved', async () => {
    const { affiliate } = await approvedAffiliate();
    const res = await request(app)
      .post('/api/affiliates/me/payouts')
      .set('Authorization', `Bearer ${affiliate}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no approved earnings/i);
  });

  it('requests, approves and reflects the balance', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);
    const [commission] = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    await request(app)
      .post(`/api/affiliates/commissions/${commission.id}/approve`)
      .set('Authorization', `Bearer ${admin}`);
    const earned = Math.round(order.totalAmount * 10) / 100;

    // Request a partial payout.
    const partial = earned / 2;
    const req = await request(app)
      .post('/api/affiliates/me/payouts')
      .set('Authorization', `Bearer ${affiliate}`)
      .send({ amount: partial });
    expect(req.status).toBe(201);

    // A second request is refused while one is pending.
    const second = await request(app)
      .post('/api/affiliates/me/payouts')
      .set('Authorization', `Bearer ${affiliate}`)
      .send({});
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/pending payout/i);

    // Over-balance request refused (earned - pending = remaining).
    const over = await request(app)
      .post('/api/affiliates/me/payouts')
      .set('Authorization', `Bearer ${affiliate}`)
      .send({ amount: earned + 1 });
    expect(over.status).toBe(400);

    // Admin approves the payout: totalPaid moves, available shrinks.
    const payouts = await request(app).get('/api/affiliates/payouts').set('Authorization', `Bearer ${admin}`);
    const payout = payouts.body.data[0];
    const approve = await request(app)
      .post(`/api/affiliates/payouts/${payout.id}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ adminNotes: 'paid via bank transfer' });
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('paid');

    const profile = await mockPrisma.affiliate.findUnique({ where: { id: affiliateId } });
    expect(profile?.totalPaid).toBe(partial);

    const stats = await request(app).get('/api/affiliates/me').set('Authorization', `Bearer ${affiliate}`);
    expect(stats.body.data.stats.paidOut).toBe(partial);
    expect(stats.body.data.stats.available).toBe(earned - partial);
  });

  it('refuses to pay a payout twice (double-approval guard)', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);
    const [commission] = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    await request(app)
      .post(`/api/affiliates/commissions/${commission.id}/approve`)
      .set('Authorization', `Bearer ${admin}`);
    await request(app).post('/api/affiliates/me/payouts').set('Authorization', `Bearer ${affiliate}`).send({});

    const payouts = await request(app).get('/api/affiliates/payouts').set('Authorization', `Bearer ${admin}`);
    const first = await request(app)
      .post(`/api/affiliates/payouts/${payouts.body.data[0].id}/approve`)
      .set('Authorization', `Bearer ${admin}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/affiliates/payouts/${payouts.body.data[0].id}/approve`)
      .set('Authorization', `Bearer ${admin}`);
    expect(second.status).toBe(400);

    const profile = await mockPrisma.affiliate.findUnique({ where: { id: affiliateId } });
    // totalPaid incremented exactly once.
    expect(profile?.totalPaid).toBe(Math.round(order.totalAmount * 10) / 100);
  });

  it('lets an admin reject a payout request', async () => {
    const { admin, affiliate, code, affiliateId } = await approvedAffiliate();
    const order = await placeOrder({ refCookie: `aff_ref=${encodeURIComponent(code)}` });
    await settleOrder(admin, order.id);
    const [commission] = await mockPrisma.affiliateCommission.findMany({ where: { affiliateId } });
    await request(app)
      .post(`/api/affiliates/commissions/${commission.id}/approve`)
      .set('Authorization', `Bearer ${admin}`);
    await request(app).post('/api/affiliates/me/payouts').set('Authorization', `Bearer ${affiliate}`).send({});

    const payouts = await request(app).get('/api/affiliates/payouts').set('Authorization', `Bearer ${admin}`);
    const reject = await request(app)
      .post(`/api/affiliates/payouts/${payouts.body.data[0].id}/reject`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ adminNotes: 'wrong IBAN' });
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe('rejected');

    const profile = await mockPrisma.affiliate.findUnique({ where: { id: affiliateId } });
    expect(Number(profile?.totalPaid ?? 0)).toBe(0);
    // Balance is untouched: the affiliate can request again.
    const again = await request(app)
      .post('/api/affiliates/me/payouts')
      .set('Authorization', `Bearer ${affiliate}`)
      .send({});
    expect(again.status).toBe(201);
  });

  it('shows own payout history', async () => {
    const { affiliate } = await approvedAffiliate();
    const res = await request(app).get('/api/affiliates/me/payouts').set('Authorization', `Bearer ${affiliate}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// =====================================================================
// Settings wiring
// =====================================================================

describe('Settings wiring', () => {
  it('PUT /api/settings toggles the program and rate', async () => {
    await disableProgram();
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ affiliateEnabled: true, affiliateRate: 7.5 });
    expect(res.status).toBe(200);

    const get = await request(app).get('/api/settings');
    expect(get.body.data.affiliateEnabled).toBe(true);
    expect(get.body.data.affiliateRate).toBe(7.5);

    // The new rate is what commissions use.
    const customer = await authHeader({ role: 'customer' });
    const apply = await request(app).post('/api/affiliates/apply').set('Authorization', `Bearer ${customer.token}`).send({});
    await request(app).post(`/api/affiliates/${apply.body.data.id}/approve`).set('Authorization', `Bearer ${admin.token}`);
    const buyer = await authHeader({ role: 'customer' });
    const p = await createProduct({ price: 100, quantity: 50 });
    await mockPrisma.cartItem.create({ data: { userId: buyer.user.id, productId: p.id, quantity: 1 } });
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('Cookie', `aff_ref=${apply.body.data.code}`)
      .send({ items: [{ productId: p.id, quantity: 1 }] });
    await settleOrder(admin.token, order.body.data.id);
    const commissions = await mockPrisma.affiliateCommission.findMany({});
    expect(commissions[0].rate).toBe(7.5);
    expect(commissions[0].amount).toBe(7.5);
  });
});
