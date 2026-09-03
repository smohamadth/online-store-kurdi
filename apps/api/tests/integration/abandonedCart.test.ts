/**
 * Abandoned-cart recovery, end-to-end.
 *
 * Drives the real sweep against the mock database so the grouping, the
 * idempotency claim, the opt-out join and the recovery attribution are all
 * exercised together - the parts that unit tests of the pure rules cannot
 * reach.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct, createCartItem } from '../helpers/factories';
import { runAbandonedCartSweep } from '../../src/modules/marketing/abandonedCart.service';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

/** Put a cart line in place and backdate it so it looks abandoned. */
async function abandonedCart(userId: string, productId: string, hours: number, qty = 1) {
  const item = await createCartItem(userId, productId, { quantity: qty });
  await mockPrisma.cartItem.update({
    where: { id: item.id },
    data: { updatedAt: hoursAgo(hours) },
  });
  return item;
}

describe('runAbandonedCartSweep', () => {
  it('sends a stage-1 email for a cart abandoned over an hour ago', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);

    const res = await runAbandonedCartSweep();
    expect(res.sent).toBe(1);

    const rows = await mockPrisma.abandonedCartEmail.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe(1);
    expect(rows[0].cartValue).toBe(25);
    expect(rows[0].itemCount).toBe(1);
  });

  it('does not mail a cart that is too fresh', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 0.2);

    const res = await runAbandonedCartSweep();
    expect(res.sent).toBe(0);
    expect(await mockPrisma.abandonedCartEmail.findMany({})).toHaveLength(0);
  });

  it('is idempotent - a second sweep does not re-send the same stage', async () => {
    // The costly failure mode: a cron that runs every 15 minutes mailing the
    // same customer four times an hour.
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);

    expect((await runAbandonedCartSweep()).sent).toBe(1);
    expect((await runAbandonedCartSweep()).sent).toBe(0);
    expect(await mockPrisma.abandonedCartEmail.findMany({})).toHaveLength(1);
  });

  it('sends the stage-2 follow-up once the cart is a day old', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 26);

    await runAbandonedCartSweep();
    const rows = await mockPrisma.abandonedCartEmail.findMany({ where: { userId: user.id } });
    expect(rows.map((r: any) => r.stage)).toEqual([2]);
  });

  it('never mails a customer who has ordered since abandoning', async () => {
    // NOTE: checkout empties the cart, so the ordinary path leaves nothing to
    // sweep. The guard still matters for the case where a cart is re-populated
    // (a re-add, or a second device syncing) AFTER an order was placed - which
    // is what this reproduces: order first, then a cart line dated earlier.
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 50 });

    await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ productId: p.id, quantity: 1 }],
      shippingAddress: {
        firstName: 'A', lastName: 'B', address: '1 St',
        city: 'NYC', state: 'NY', zipCode: '10001', country: 'US',
      },
    }).expect(201);

    // Cart line older than the order => the order counts as "since".
    await abandonedCart(user.id, p.id, 3);

    const res = await runAbandonedCartSweep();
    expect(res.sent).toBe(0);
    expect(res.skipped['ordered since']).toBe(1);
  });

  it('never mails someone who unsubscribed', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 3);

    await request(app).post('/api/newsletter/subscribe').send({ email: user.email }).expect(200);
    const sub = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: String(user.email).toLowerCase() },
    });
    await request(app).get(`/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}`).expect(200);

    const res = await runAbandonedCartSweep();
    expect(res.sent).toBe(0);
    expect(res.skipped['unsubscribed']).toBe(1);
  });

  it('groups multiple lines into one email per customer', async () => {
    // Two products in one cart is one abandoned cart, not two.
    const { user } = await authHeader();
    const a = await createProduct({ price: 10, quantity: 10, sku: 'A1', slug: 'a1' });
    const b = await createProduct({ price: 15, quantity: 10, sku: 'B1', slug: 'b1' });
    await abandonedCart(user.id, a.id, 3, 2);
    await abandonedCart(user.id, b.id, 3, 1);

    const res = await runAbandonedCartSweep();
    expect(res.considered).toBe(1);
    expect(res.sent).toBe(1);

    const row = (await mockPrisma.abandonedCartEmail.findMany({}))[0];
    expect(row.itemCount).toBe(3);       // 2 + 1
    expect(row.cartValue).toBe(35);      // 10*2 + 15*1
  });

  it('treats the most recent line as the cart age', async () => {
    // Adding an item means the shopper is still active, so the clock restarts
    // and they should not be nagged yet.
    const { user } = await authHeader();
    const a = await createProduct({ price: 10, quantity: 10, sku: 'A2', slug: 'a2' });
    const b = await createProduct({ price: 10, quantity: 10, sku: 'B2', slug: 'b2' });
    await abandonedCart(user.id, a.id, 5);
    await abandonedCart(user.id, b.id, 0.1);

    expect((await runAbandonedCartSweep()).sent).toBe(0);
  });

  it('mails several customers independently', async () => {
    const u1 = await authHeader();
    const u2 = await authHeader();
    const p = await createProduct({ price: 20, quantity: 50 });
    await abandonedCart(u1.user.id, p.id, 3);
    await abandonedCart(u2.user.id, p.id, 3);

    const res = await runAbandonedCartSweep();
    expect(res.considered).toBe(2);
    expect(res.sent).toBe(2);
  });

  it('ignores carts older than the cutoff', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 20, quantity: 10 });
    await abandonedCart(user.id, p.id, 200);

    const res = await runAbandonedCartSweep();
    // Excluded in SQL, so it is not even considered.
    expect(res.sent).toBe(0);
  });

  it('dryRun reports without writing or sending', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);

    const res = await runAbandonedCartSweep({ dryRun: true });
    expect(res.sent).toBe(1);
    // Nothing persisted, so a real run afterwards still sends.
    expect(await mockPrisma.abandonedCartEmail.findMany({})).toHaveLength(0);
    expect((await runAbandonedCartSweep()).sent).toBe(1);
  });
});

describe('recovery attribution', () => {
  it('marks the email as recovered when the customer then orders', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);
    await runAbandonedCartSweep();

    await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ productId: p.id, quantity: 1 }],
      shippingAddress: {
        firstName: 'A', lastName: 'B', address: '1 St',
        city: 'NYC', state: 'NY', zipCode: '10001', country: 'US',
      },
    }).expect(201);

    const rows = await mockPrisma.abandonedCartEmail.findMany({ where: { userId: user.id } });
    expect(rows[0].recoveredAt).toBeTruthy();
    expect(rows[0].orderId).toBeTruthy();
  });

  it('does not attribute another customer\'s order', async () => {
    const a = await authHeader();
    const b = await authHeader();
    const p = await createProduct({ price: 25, quantity: 50 });
    await abandonedCart(a.user.id, p.id, 2);
    await runAbandonedCartSweep();

    await request(app).post('/api/orders').set('Authorization', `Bearer ${b.token}`).send({
      items: [{ productId: p.id, quantity: 1 }],
      shippingAddress: {
        firstName: 'A', lastName: 'B', address: '1 St',
        city: 'NYC', state: 'NY', zipCode: '10001', country: 'US',
      },
    }).expect(201);

    const rows = await mockPrisma.abandonedCartEmail.findMany({ where: { userId: a.user.id } });
    expect(rows).toHaveLength(1);
    // B's order must not close out A's reminder. `recoveredAt` is unset here,
    // which the mock represents as undefined rather than null.
    expect(rows[0].recoveredAt ?? null).toBeNull();
    expect(rows[0].orderId ?? null).toBeNull();
  });
});

describe('POST /api/marketing/abandoned-carts/run', () => {
  it('requires an admin', async () => {
    const { token } = await authHeader();
    await request(app)
      .post('/api/marketing/abandoned-carts/run')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects an anonymous caller', async () => {
    await request(app).post('/api/marketing/abandoned-carts/run').expect(401);
  });

  it('runs for an admin and reports counts', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);

    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/marketing/abandoned-carts/run')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.data.dryRun).toBe(true);
    expect(res.body.data.sent).toBe(1);
  });
});

describe('GET /api/marketing/abandoned-carts/stats', () => {
  it('reports 0 rather than NaN on an empty table', async () => {
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/marketing/abandoned-carts/stats')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ sent: 0, recovered: 0, recoveryRate: 0 });
  });

  it('computes the recovery rate', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 40, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);
    await runAbandonedCartSweep();
    await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ productId: p.id, quantity: 1 }],
      shippingAddress: {
        firstName: 'A', lastName: 'B', address: '1 St',
        city: 'NYC', state: 'NY', zipCode: '10001', country: 'US',
      },
    }).expect(201);

    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/marketing/abandoned-carts/stats')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.body.data.sent).toBe(1);
    expect(res.body.data.recovered).toBe(1);
    expect(res.body.data.recoveryRate).toBe(1);
    expect(res.body.data.recoveredValue).toBe(40);
  });

  it('is not readable by a customer', async () => {
    const { token } = await authHeader();
    await request(app)
      .get('/api/marketing/abandoned-carts/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});

// ---------------------------------------------------------------------------
// Every marketing email must carry a WORKING one-click unsubscribe link.
//
// Regression: the unsubscribe URL was built from the newsletter subscriber's
// token, but a customer who never joined the newsletter has no subscriber row.
// The link came out as `?token=` with an empty value, which the endpoint
// rejects with 400 - a dead opt-out link on marketing mail (CAN-SPAM/GDPR)
// and a guaranteed spam complaint.
// ---------------------------------------------------------------------------
describe('unsubscribe link in the recovery email', () => {
  it('works for a customer who never joined the newsletter', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);

    // No newsletter subscription exists for this user at all.
    const before = await mockPrisma.newsletterSubscriber.findMany({});
    expect(before).toHaveLength(0);

    expect((await runAbandonedCartSweep()).sent).toBe(1);

    // A suppression row is minted so the opt-out link resolves.
    const sub = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: String(user.email).toLowerCase() },
    });
    expect(sub).toBeTruthy();
    expect(sub.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('marks the minted row as having given no marketing consent', async () => {
    // The row exists so the opt-out works, NOT because the customer agreed to
    // marketing. Recording consent here would manufacture evidence.
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);
    await runAbandonedCartSweep();

    const sub = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: String(user.email).toLowerCase() },
    });
    expect(sub.consentAt ?? null).toBeNull();
    expect(sub.source).toBe('abandoned-cart');
  });

  it('the minted token actually unsubscribes them', async () => {
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);
    await runAbandonedCartSweep();

    const sub = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: String(user.email).toLowerCase() },
    });
    await request(app)
      .get(`/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}`)
      .expect(200);

    const after = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: String(user.email).toLowerCase() },
    });
    expect(after.status).toBe('unsubscribed');
  });

  it('and that opt-out stops the follow-up stage', async () => {
    // The whole point of a working link: clicking it must actually end the
    // sequence, not just the one message.
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);
    await runAbandonedCartSweep();

    const sub = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: String(user.email).toLowerCase() },
    });
    await request(app).get(`/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}`).expect(200);

    // Age the cart into stage 2 and sweep again.
    const items = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    await mockPrisma.cartItem.update({
      where: { id: items[0].id },
      data: { updatedAt: hoursAgo(30) },
    });

    const res = await runAbandonedCartSweep();
    expect(res.sent).toBe(0);
    expect(res.skipped['unsubscribed']).toBe(1);
  });

  it('reuses the existing token for a real subscriber', async () => {
    // A genuine subscriber must keep their token; re-minting would break the
    // unsubscribe link in every email already in their inbox.
    const { user } = await authHeader();
    const p = await createProduct({ price: 25, quantity: 10 });
    await abandonedCart(user.id, p.id, 2);

    await request(app).post('/api/newsletter/subscribe').send({ email: user.email }).expect(200);
    const before = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: String(user.email).toLowerCase() },
    });

    await runAbandonedCartSweep();

    const after = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: String(user.email).toLowerCase() },
    });
    expect(after.unsubscribeToken).toBe(before.unsubscribeToken);
    expect(after.consentAt).toBeTruthy();   // real consent preserved
    expect(after.source).not.toBe('abandoned-cart');
  });
});

// ---------------------------------------------------------------------------
// The send budget must cap EMAILS SENT, not candidates examined.
//
// The loop counted every candidate against `limit`, including ones it skipped.
// Map iteration follows insertion order, which follows the query's row order,
// and skip decisions are deterministic - so a store whose first N carts are
// all ineligible (too old, already mailed) burned the whole budget on them and
// mailed nobody. The same eligible customers were starved on every run,
// forever, and the sweep reported "sent: 0" as if there were nothing to do.
// ---------------------------------------------------------------------------
describe('send budget', () => {
  /** One eligible cart per user, all abandoned two hours ago. */
  async function eligibleCarts(n: number, product: { id: string }) {
    const users = [];
    for (let i = 0; i < n; i++) {
      const { user } = await authHeader();
      await abandonedCart(user.id, product.id, 2);
      users.push(user);
    }
    return users;
  }

  it('caps the number of emails actually sent', async () => {
    const p = await createProduct({ price: 25, quantity: 500 });
    await eligibleCarts(5, p);

    const res = await runAbandonedCartSweep({ limit: 2 });
    expect(res.sent).toBe(2);
    expect(await mockPrisma.abandonedCartEmail.findMany({})).toHaveLength(2);
  });

  it('does not let skipped candidates consume the budget', async () => {
    // Three carts that will always skip, then two that should be mailed.
    // With a budget of 2 counted against EXAMINED candidates, the skips eat
    // it and nobody is emailed.
    const p = await createProduct({ price: 25, quantity: 500 });

    // Too old to ever qualify (beyond MAX_AGE_HOURS is filtered in SQL, so
    // use "already sent every stage" instead - skipped, but still fetched).
    for (let i = 0; i < 3; i++) {
      const { user } = await authHeader();
      await abandonedCart(user.id, p.id, 2);
      await mockPrisma.abandonedCartEmail.create({
        data: { userId: user.id, stage: 1, itemCount: 1, cartValue: 25 },
      });
      await mockPrisma.abandonedCartEmail.create({
        data: { userId: user.id, stage: 2, itemCount: 1, cartValue: 25 },
      });
    }

    const wanted = await eligibleCarts(2, p);

    const res = await runAbandonedCartSweep({ limit: 2 });
    expect(res.sent).toBe(2);

    // Both genuinely-eligible customers were reached.
    for (const u of wanted) {
      const rows = await mockPrisma.abandonedCartEmail.findMany({ where: { userId: u.id } });
      expect(rows.length, `user ${u.id} should have been mailed`).toBeGreaterThan(0);
    }
  });

  it('still examines every candidate so the skip report stays accurate', async () => {
    const p = await createProduct({ price: 25, quantity: 500 });
    const { user } = await authHeader();
    await abandonedCart(user.id, p.id, 2);
    await mockPrisma.abandonedCartEmail.create({
      data: { userId: user.id, stage: 1, itemCount: 1, cartValue: 25 },
    });
    await mockPrisma.abandonedCartEmail.create({
      data: { userId: user.id, stage: 2, itemCount: 1, cartValue: 25 },
    });
    await eligibleCarts(1, p);

    const res = await runAbandonedCartSweep({ limit: 1 });
    expect(res.sent).toBe(1);
    // The skipped one is still counted and reported, not silently dropped.
    expect(res.considered).toBe(2);
    expect(res.skipped['no stage due']).toBe(1);
  });

  it('stops work once the budget is spent', async () => {
    // The cap must be a real stop, not just a counter: a huge backlog must
    // not mail everyone in one tick.
    const p = await createProduct({ price: 25, quantity: 500 });
    await eligibleCarts(6, p);

    const res = await runAbandonedCartSweep({ limit: 3 });
    expect(res.sent).toBe(3);
    expect(await mockPrisma.abandonedCartEmail.findMany({})).toHaveLength(3);
  });

  it('counts dry-run sends against the budget too', async () => {
    // Otherwise a dry run reports a volume the real run could never produce.
    const p = await createProduct({ price: 25, quantity: 500 });
    await eligibleCarts(5, p);

    const res = await runAbandonedCartSweep({ limit: 2, dryRun: true });
    expect(res.sent).toBe(2);
    expect(await mockPrisma.abandonedCartEmail.findMany({})).toHaveLength(0);
  });
});

describe('scan cap', () => {
  it('bounds the work when almost nothing is eligible', async () => {
    // Budgeting only SENDS would make the loop walk every candidate (three
    // queries each) hunting for someone to mail. maxScan keeps a sweep over a
    // large backlog bounded.
    const p = await createProduct({ price: 25, quantity: 500 });
    for (let i = 0; i < 5; i++) {
      const { user } = await authHeader();
      await abandonedCart(user.id, p.id, 2);
      await mockPrisma.abandonedCartEmail.create({
        data: { userId: user.id, stage: 1, itemCount: 1, cartValue: 25 },
      });
      await mockPrisma.abandonedCartEmail.create({
        data: { userId: user.id, stage: 2, itemCount: 1, cartValue: 25 },
      });
    }

    const res = await runAbandonedCartSweep({ limit: 10, maxScan: 2 });
    expect(res.sent).toBe(0);
    expect(res.scanTruncated).toBe(true);
    // Only the scanned ones were evaluated, not all five.
    const totalSkips = Object.values(res.skipped as Record<string, number>)
      .reduce((a, b) => a + b, 0);
    expect(totalSkips).toBe(2);
  });

  it('does not flag truncation when the whole backlog fits', async () => {
    const p = await createProduct({ price: 25, quantity: 500 });
    const { user } = await authHeader();
    await abandonedCart(user.id, p.id, 2);

    const res = await runAbandonedCartSweep({ limit: 10, maxScan: 100 });
    expect(res.sent).toBe(1);
    expect(res.scanTruncated).toBeUndefined();
  });

  it('the send budget still wins when candidates are eligible', async () => {
    // A generous scan cap must not let more mail out than `limit` allows.
    const p = await createProduct({ price: 25, quantity: 500 });
    for (let i = 0; i < 4; i++) {
      const { user } = await authHeader();
      await abandonedCart(user.id, p.id, 2);
    }

    const res = await runAbandonedCartSweep({ limit: 2, maxScan: 1000 });
    expect(res.sent).toBe(2);
    expect(res.scanTruncated).toBeUndefined();
  });
});

describe('POST /api/marketing/abandoned-carts/run honours a limit', () => {
  it('accepts an explicit send cap', async () => {
    const p = await createProduct({ price: 25, quantity: 500 });
    for (let i = 0; i < 4; i++) {
      const { user } = await authHeader();
      await abandonedCart(user.id, p.id, 2);
    }

    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/marketing/abandoned-carts/run')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(2);
  });

  it('clamps an absurd limit rather than letting a caller uncap the sweep', async () => {
    const p = await createProduct({ price: 25, quantity: 500 });
    const { user } = await authHeader();
    await abandonedCart(user.id, p.id, 2);

    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/marketing/abandoned-carts/run')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ limit: 999999 });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(1);
  });

  it.each([[0], [-5], ['abc'], [null]])('ignores a nonsense limit %j', async (bad) => {
    const p = await createProduct({ price: 25, quantity: 500 });
    const { user } = await authHeader();
    await abandonedCart(user.id, p.id, 2);

    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/marketing/abandoned-carts/run')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ limit: bad });

    // Falls back to the default budget, so the sweep still works.
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(1);
  });
});
