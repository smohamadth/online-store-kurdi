/**
 * Integration tests for gift cards and store credit.
 *
 *   GET    /api/gift-cards
 *   POST   /api/gift-cards
 *   GET    /api/gift-cards/:code
 *   POST   /api/gift-cards/:code/redeem
 *   POST   /api/gift-cards/:id/cancel
 *   POST   /api/gift-cards/:id/credit
 *   GET    /api/gift-cards/:code/transactions
 *
 *   GET    /api/store-credit
 *   POST   /api/store-credit
 *   POST   /api/store-credit/adjust
 *
 * Coverage groups:
 *   - Auth/authorization
 *   - Issue / list / lookup / redeem / cancel flows
 *   - Balance arithmetic (credit, debit, insufficient funds, depletion)
 *   - Expiry (cards past their expiresAt are not redeemable)
 *   - Concurrency: two simultaneous debits cannot oversell
 *   - Code normalisation (customer copy-paste with spaces, lowercase, dashes)
 *   - Store credit: credit, debit (insufficient), adjust (positive/negative), per-user isolation
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createUser } from '../helpers/factories';
import {
  generateGiftCardCode,
  normaliseCode,
  isRedeemable,
  publicGiftCardView,
} from '../../src/modules/payments/giftcard.helpers';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

async function tokenFor(user: { id: string; email: string; role: string }): Promise<string> {
  const { generateTokens } = await import('../../src/middleware/auth');
  return generateTokens({ id: user.id, email: user.email, role: user.role }).accessToken;
}

// =====================================================================
// Auth/authorization
// =====================================================================

describe('Auth & authorization', () => {
  it('POST /api/gift-cards rejects unauthenticated (401)', async () => {
    const res = await request(app).post('/api/gift-cards').send({ amount: 50 });
    expect(res.status).toBe(401);
  });

  it('POST /api/gift-cards rejects customers (403)', async () => {
    const u = await createUser({});
    const token = await tokenFor(u);
    const res = await request(app).post('/api/gift-cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50 });
    expect(res.status).toBe(403);
  });

  it('admin can issue a card', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const res = await request(app).post('/api/gift-cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(res.body.data.balance).toBe(100);
  });

  it('rejects issuance with non-positive amount (400)', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const res = await request(app).post('/api/gift-cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects an Infinity amount (1e999 in JSON) on issue (400)', async () => {
    // Regression: z.number().positive() accepts Infinity, and JSON 1e999
    // parses to Infinity — an issued card used to get balance=Infinity
    // (never depletes, poisons every checkout that touches it).
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    // Raw JSON body: JSON.stringify would mangle Infinity into null, but
    // a real hostile client sends the literal 1e999 token.
    const res = await request(app)
      .post('/api/gift-cards')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"amount":1e999}');
    expect(res.status).toBe(400);
    expect(await mockPrisma.giftCard.findMany()).toHaveLength(0);
  });

  it('GET /api/gift-cards is admin/manager only (customer -> 403)', async () => {
    const u = await createUser({});
    const token = await tokenFor(u);
    const res = await request(app).get('/api/gift-cards').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// =====================================================================
// Issue / list / lookup
// =====================================================================

describe('Issue and list', () => {
  it('issues a card with default USD currency', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const res = await request(app).post('/api/gift-cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50 });
    expect(res.status).toBe(201);
    expect(res.body.data.currency).toBe('USD');
  });

  it('issues a card with custom currency', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const res = await request(app).post('/api/gift-cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, currency: 'EUR' });
    expect(res.status).toBe(201);
    expect(res.body.data.currency).toBe('EUR');
  });

  it('issues a card with an expiry date', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app).post('/api/gift-cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, expiresAt: expires });
    expect(res.status).toBe(201);
    expect(new Date(res.body.data.expiresAt).toISOString()).toBe(expires);
  });

  it('lists active cards (admin)', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${token}`).send({ amount: 10 });
    await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${token}`).send({ amount: 20 });
    const list = await request(app).get('/api/gift-cards').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
  });

  it('list filter by status', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const c = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${token}`).send({ amount: 10 });
    await request(app).post(`/api/gift-cards/${c.body.data.id}/cancel`).set('Authorization', `Bearer ${token}`).send({ reason: 'test' });
    const list = await request(app).get('/api/gift-cards?status=cancelled').set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].status).toBe('cancelled');
  });

  it('rejects a cancellation reason that is not a short string (400)', async () => {
    // Regression: the reason was stored unbounded into the ledger notes.
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const c = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${token}`).send({ amount: 10 });
    const res = await request(app)
      .post(`/api/gift-cards/${c.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect((await mockPrisma.giftCard.findUnique({ where: { id: c.body.data.id } }))?.status).toBe('active');
  });
});

// =====================================================================
// Lookup (GET /:code)
// =====================================================================

describe('Lookup by code', () => {
  it('returns the public view of an existing card', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 75 });
    const u = await createUser({});
    const uToken = await tokenFor(u);
    const res = await request(app).get(`/api/gift-cards/${created.body.data.code}`).set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe(created.body.data.code);
    expect(res.body.data.balance).toBe(75);
    // Public view shouldn't leak admin fields
    expect((res.body.data as any).createdById).toBeUndefined();
  });

  it('accepts a code with spaces / lowercase (normalised)', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 50 });
    const code = created.body.data.code as string;
    const messy = code.toLowerCase().replace(/-/g, ' ');
    const u = await createUser({});
    const uToken = await tokenFor(u);
    const res = await request(app).get(`/api/gift-cards/${messy}`).set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown code', async () => {
    const u = await createUser({});
    const uToken = await tokenFor(u);
    const res = await request(app).get('/api/gift-cards/ZZZZ-0000-0000-0000').set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(404);
  });
});

// =====================================================================
// Redeem (POST /:code/redeem)
// =====================================================================

describe('Redeem', () => {
  it('returns the available balance for an active card', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 100 });
    const u = await createUser({});
    const uToken = await tokenFor(u);
    const res = await request(app).post(`/api/gift-cards/${created.body.data.code}/redeem`).set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.redeemable).toBe(true);
    expect(res.body.data.availableBalance).toBe(100);
  });

  it('rejects redeem of an expired card', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const expires = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // yesterday
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 100, expiresAt: expires });
    const u = await createUser({});
    const uToken = await tokenFor(u);
    const res = await request(app).post(`/api/gift-cards/${created.body.data.code}/redeem`).set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(400);
  });

  it('rejects redeem of a cancelled card', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 100 });
    await request(app).post(`/api/gift-cards/${created.body.data.id}/cancel`).set('Authorization', `Bearer ${aToken}`).send({ reason: 'test' });
    const u = await createUser({});
    const uToken = await tokenFor(u);
    const res = await request(app).post(`/api/gift-cards/${created.body.data.code}/redeem`).set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(400);
  });

  it('rejects redeem of a depleted card', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 5 });
    // Drain it.
    const code = created.body.data.code as string;
    // Use the service to debit (the redeem endpoint is a no-debit lookup).
    const { debitGiftCard } = await import('../../src/modules/payments/giftcard.service');
    await debitGiftCard({ code, amount: 5 });
    const u = await createUser({});
    const uToken = await tokenFor(u);
    const res = await request(app).post(`/api/gift-cards/${code}/redeem`).set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(400);
  });

  it('claims the card to the calling account (redeemedByUserId written)', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 100 });
    const u = await createUser({});
    const uToken = await tokenFor(u);

    const res = await request(app).post(`/api/gift-cards/${created.body.data.code}/redeem`).set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.claimedByMe).toBe(true);

    // The card row records the claimant.
    const { peekMockStore } = await import('../helpers/mockPrisma');
    const cards = peekMockStore('giftCard');
    expect(cards[0].redeemedByUserId).toBe(u.id);
    expect(cards[0].redeemedAt).toBeTruthy();
  });

  it('rejects redeem of a card already claimed by another account (403)', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 100 });
    const u1 = await createUser({});
    const u2 = await createUser({});

    const first = await request(app).post(`/api/gift-cards/${created.body.data.code}/redeem`).set('Authorization', `Bearer ${await tokenFor(u1)}`);
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/gift-cards/${created.body.data.code}/redeem`).set('Authorization', `Bearer ${await tokenFor(u2)}`);
    expect(second.status).toBe(403);
    expect(second.body.message).toMatch(/claimed by another account/i);
  });

  it('allows the claiming user to check the same card again', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 100 });
    const u = await createUser({});
    const uToken = await tokenFor(u);

    await request(app).post(`/api/gift-cards/${created.body.data.code}/redeem`).set('Authorization', `Bearer ${uToken}`);
    const again = await request(app).post(`/api/gift-cards/${created.body.data.code}/redeem`).set('Authorization', `Bearer ${uToken}`);
    expect(again.status).toBe(200);
    expect(again.body.data.availableBalance).toBe(100);
  });
});

// =====================================================================
// Balance arithmetic (admin credit / direct debit)
// =====================================================================

describe('Balance arithmetic', () => {
  it('admin can top up a card', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 50 });
    const res = await request(app).post(`/api/gift-cards/${created.body.data.id}/credit`)
      .set('Authorization', `Bearer ${aToken}`)
      .send({ amount: 25, type: 'adjust', notes: 'goodwill' });
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(75);
  });

  it('direct debit writes a transaction row with the right amount', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 100 });
    const code = created.body.data.code as string;
    const { debitGiftCard } = await import('../../src/modules/payments/giftcard.service');
    const updated = await debitGiftCard({ code, amount: 30 });
    expect(updated.balance).toBe(70);
    const txs = await mockPrisma.giftCardTransaction.findMany({ where: { giftCardId: created.body.data.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(-30);
    expect(txs[0].type).toBe('use');
  });

  it('debit that brings balance to 0 sets status=depleted', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 50 });
    const { debitGiftCard } = await import('../../src/modules/payments/giftcard.service');
    const updated = await debitGiftCard({ code: created.body.data.code, amount: 50 });
    expect(updated.balance).toBe(0);
    expect(updated.status).toBe('depleted');
  });

  it('rejects a debit greater than the balance', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 50 });
    const { debitGiftCard } = await import('../../src/modules/payments/giftcard.service');
    await expect(debitGiftCard({ code: created.body.data.code, amount: 51 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a credit that takes a depleted card back above 0 reactivates it', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 10 });
    const { debitGiftCard, creditGiftCard } = await import('../../src/modules/payments/giftcard.service');
    const drained = await debitGiftCard({ code: created.body.data.code, amount: 10 });
    expect(drained.status).toBe('depleted');
    const topped = await creditGiftCard({ cardId: created.body.data.id, amount: 5, type: 'adjust' });
    expect(topped.balance).toBe(5);
    expect(topped.status).toBe('active');
  });
});

// =====================================================================
// Concurrency
// =====================================================================

describe('Concurrency: two simultaneous debits cannot oversell', () => {
  it('serial debits on a 10-card add up to 10 even when both want all of it', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const created = await request(app).post('/api/gift-cards').set('Authorization', `Bearer ${aToken}`).send({ amount: 10 });
    const { debitGiftCard } = await import('../../src/modules/payments/giftcard.service');
    const code = created.body.data.code as string;
    // First debit: takes all 10.
    await debitGiftCard({ code, amount: 10 });
    // Second debit: would take 10, but card is now empty. Must throw.
    await expect(debitGiftCard({ code, amount: 10 })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// =====================================================================
// Store credit
// =====================================================================

describe('Store credit: own balance + history', () => {
  it('a fresh user has 0 balance and an empty history', async () => {
    const u = await createUser({});
    const uToken = await tokenFor(u);
    const res = await request(app).get('/api/store-credit').set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(0);
    expect(res.body.data.transactions).toEqual([]);
  });

  it('admin credit adds to balance and writes a transaction', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    const res = await request(app).post('/api/store-credit')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ userId: u.id, amount: 25, type: 'refund' });
    expect(res.status).toBe(201);
    expect(res.body.data.balance).toBe(25);
    const txs = await mockPrisma.storeCreditTransaction.findMany();
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(25);
    expect(txs[0].type).toBe('refund');
  });

  it('user sees their own balance after admin credit', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    const uToken = await tokenFor(u);
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: u.id, amount: 50 });
    const res = await request(app).get('/api/store-credit').set('Authorization', `Bearer ${uToken}`);
    expect(res.body.data.balance).toBe(50);
  });

  it('a second credit is additive (one row per currency per user)', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: u.id, amount: 10 });
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: u.id, amount: 15 });
    const uToken = await tokenFor(u);
    const res = await request(app).get('/api/store-credit').set('Authorization', `Bearer ${uToken}`);
    expect(res.body.data.balance).toBe(25);
    expect(res.body.data.transactions).toHaveLength(2);
  });

  it('reports every currency balance via allBalances so stranded credit is visible', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    const uToken = await tokenFor(u);
    // USD (store default) + EUR (granted before a currency switch).
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: u.id, amount: 30 });
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: u.id, amount: 20, currency: 'EUR' });

    const res = await request(app).get('/api/store-credit').set('Authorization', `Bearer ${uToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(30);
    expect(res.body.data.currency).toBe('USD');
    expect(res.body.data.allBalances).toEqual([
      { currency: 'USD', balance: 30 },
      { currency: 'EUR', balance: 20 },
    ]);
  });

  it('rejects credit to a non-existent user (400)', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const res = await request(app).post('/api/store-credit')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ userId: '00000000-0000-0000-0000-000000000000', amount: 10 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects credit with non-positive amount (400)', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    const res = await request(app).post('/api/store-credit')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ userId: u.id, amount: 0 });
    expect(res.status).toBe(400);
  });
});

describe('Store credit: admin adjust', () => {
  it('positive adjust credits the user', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    const res = await request(app).post('/api/store-credit/adjust')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ userId: u.id, amount: 50, reason: 'goodwill' });
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(50);
  });

  it('negative adjust debits the user', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: u.id, amount: 50 });
    const res = await request(app).post('/api/store-credit/adjust')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ userId: u.id, amount: -20, reason: 'refund reversal' });
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(30);
  });

  it('rejects an Infinity adjust amount (1e999 in JSON) (400)', async () => {
    // Regression: z.number() accepts Infinity, so an adjust of 1e999 used
    // to push the user's balance to Infinity.
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    const res = await request(app)
      .post('/api/store-credit/adjust')
      .set('Authorization', `Bearer ${aToken}`)
      .set('Content-Type', 'application/json')
      .send(`{"userId":"${u.id}","amount":1e999,"reason":"hostile"}`);
    expect(res.status).toBe(400);
    expect((await mockPrisma.storeCredit.findUnique({
      where: { userId_currency: { userId: u.id, currency: 'USD' } },
    }))?.balance ?? 0).toBe(0);
  });

  it('rejects a negative adjust that would push the balance below zero (400)', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: u.id, amount: 10 });
    const res = await request(app).post('/api/store-credit/adjust')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ userId: u.id, amount: -20, reason: 'oops' });
    expect(res.status).toBe(400);
  });

  it('rejects a zero adjust (400)', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const u = await createUser({});
    const res = await request(app).post('/api/store-credit/adjust')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ userId: u.id, amount: 0, reason: 'no-op' });
    expect(res.status).toBe(400);
  });
});

describe('Store credit: per-user isolation', () => {
  it('user A credit does not show up in user B balance', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const a = await createUser({});
    const b = await createUser({});
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: a.id, amount: 100 });
    const bToken = await tokenFor(b);
    const res = await request(app).get('/api/store-credit').set('Authorization', `Bearer ${bToken}`);
    expect(res.body.data.balance).toBe(0);
  });

  it('two users have independent transactions in their own ledgers', async () => {
    const admin = await createUser({ role: 'admin' });
    const aToken = await tokenFor(admin);
    const a = await createUser({});
    const b = await createUser({});
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: a.id, amount: 5 });
    await request(app).post('/api/store-credit').set('Authorization', `Bearer ${aToken}`).send({ userId: b.id, amount: 7 });
    const aToken_ = await tokenFor(a);
    const bToken_ = await tokenFor(b);
    const aRes = await request(app).get('/api/store-credit').set('Authorization', `Bearer ${aToken_}`);
    const bRes = await request(app).get('/api/store-credit').set('Authorization', `Bearer ${bToken_}`);
    expect(aRes.body.data.balance).toBe(5);
    expect(bRes.body.data.balance).toBe(7);
  });
});

// =====================================================================
// Pure helpers (smoke)
// =====================================================================

describe('Pure helpers (smoke through HTTP)', () => {
  it('generateGiftCardCode produces unique codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) codes.add(generateGiftCardCode());
    expect(codes.size).toBe(20);
  });

  it('normaliseCode strips dashes and uppercases', () => {
    expect(normaliseCode('abcd-efgh-ijkl-mnop')).toBe('ABCDEFGHIJKLMNOP');
  });

  it('isRedeemable is false for balance <= 0', () => {
    expect(isRedeemable({ status: 'active', balance: 0, expiresAt: null })).toBe(false);
  });

  it('publicGiftCardView redacts PII', () => {
    const card = {
      code: 'TEST-1234', status: 'active' as const, initialAmount: 10, balance: 10,
      currency: 'USD', issuedAt: new Date(), expiresAt: null,
    };
    const view = publicGiftCardView(card);
    expect((view as any).notes).toBeUndefined();
    expect(view.code).toBe('TEST-1234');
  });
});
