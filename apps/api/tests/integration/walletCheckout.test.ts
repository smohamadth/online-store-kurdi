/**
 * Wallet-at-checkout integration tests: store credit and gift cards
 * debited at order placement.
 *
 * Notable paths:
 *   - store credit / gift card apply AFTER the coupon, never below zero
 *   - full wallet coverage settles the order (paymentStatus completed,
 *     Payment ledger row, status processing) without a gateway session
 *   - partial coverage keeps the order pending; the remainder is paid
 *     by the chosen method
 *   - gift cards are validated (exists / redeemable / currency) BEFORE
 *     the order is created, so a bad code never leaves an order behind
 *   - a partial wallet payment cannot be mixed with an online gateway
 *   - refunds can credit back to store credit; cash refunds are capped
 *     at the amount actually paid in cash
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma, peekMockStore } from '../helpers/mockPrisma';
import { createProduct, createCategory } from '../helpers/factories';
import { AppError } from '../../src/middleware/errorHandler';
import * as giftcardService from '../../src/modules/payments/giftcard.service';
import {
  debitStoreCredit,
  creditStoreCredit,
} from '../../src/modules/payments/storecredit.service';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

async function placeOrder(
  token: string,
  productId: string,
  body: Record<string, any> = {}
) {
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      items: [{ productId, quantity: 1 }],
      shippingAddress: {
        firstName: 'A', lastName: 'B', address: '1 Main St',
        city: 'C', state: 'S', zipCode: '00000', country: 'US',
      },
      paymentMethod: 'cash_on_delivery',
      ...body,
    });
}

async function issueGiftCard(adminToken: string, amount: number, over: Record<string, any> = {}) {
  const res = await request(app)
    .post('/api/gift-cards')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ amount, ...over });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function grantStoreCredit(adminToken: string, userId: string, amount: number) {
  const res = await request(app)
    .post('/api/store-credit')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId, amount });
  expect(res.status).toBe(201);
}

describe('checkout with store credit', () => {
  it('fully covers the order: settled, ledgered, balance zeroed', async () => {
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 10, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 10);

    const res = await placeOrder(token, product.id, { applyStoreCredit: true });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('completed');
    expect(res.body.data.status).toBe('processing');
    expect(res.body.data.storeCreditApplied).toBe(10);
    expect(res.body.data.totalAmount).toBe(10);

    // Store credit balance is zero and the ledger row is linked.
    const rows = peekMockStore('storeCredit');
    expect(rows[0].balance).toBe(0);
    const txs = peekMockStore('storeCreditTransaction');
    expect(txs.some((t: any) => t.type === 'order_use' && t.amount === -10 && t.orderId)).toBe(true);

    // A Payment ledger row records the settlement (method store_credit).
    const payments = peekMockStore('payment');
    expect(payments.some((p: any) => p.method === 'store_credit' && p.amount === 10)).toBe(true);
  });

  it('partially covers the order: remainder stays pending on COD', async () => {
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 50, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 20);

    const res = await placeOrder(token, product.id, { applyStoreCredit: true });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('pending');
    expect(res.body.data.storeCreditApplied).toBe(20);
    // Amount still due = 50 - 20 = 30 (totalAmount keeps the full value).
    expect(res.body.data.totalAmount).toBe(50);
  });

  it('applies AFTER the coupon, never below zero', async () => {
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 100, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 200); // more than the order

    // 10% coupon on 100 -> total 90 after discount.
    const coupon = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ code: 'WALLET10', type: 'percentage', value: 10 });
    expect(coupon.status).toBe(201);

    const res = await placeOrder(token, product.id, { applyStoreCredit: true, couponCode: 'WALLET10' });
    expect(res.status).toBe(201);
    // Coupon first: discount 10 -> subtotal-total 90; credit covers 90.
    expect(res.body.data.discountAmount).toBe(10);
    expect(res.body.data.storeCreditApplied).toBe(90);
    expect(res.body.data.totalAmount).toBe(90);
    // The credit balance only lost 90, not 100.
    const rows = peekMockStore('storeCredit');
    expect(rows[0].balance).toBe(110);
  });

  it('is a no-op when the customer has no balance', async () => {
    const { token } = await authHeader();
    const cat = await createCategory();
    const product = await createProduct({ price: 10, quantity: 5, categoryId: cat.id });

    const res = await placeOrder(token, product.id, { applyStoreCredit: true });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('pending');
    expect(res.body.data.storeCreditApplied ?? 0).toBe(0);
  });
});

describe('checkout with gift cards', () => {
  it('fully covers the order: card depleted and ledgered', async () => {
    const { token } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 30, quantity: 5, categoryId: cat.id });
    const card = await issueGiftCard(admin.token, 30);

    const res = await placeOrder(token, product.id, { giftCardCode: card.code });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('completed');
    expect(res.body.data.giftCardApplied).toBe(30);
    expect(res.body.data.giftCardCode).toBe(card.code);

    const cards = peekMockStore('giftCard');
    expect(cards[0].balance).toBe(0);
    expect(cards[0].status).toBe('depleted');
    const txs = peekMockStore('giftCardTransaction');
    expect(txs.some((t: any) => t.type === 'use' && t.amount === -30 && t.orderId)).toBe(true);

    const payments = peekMockStore('payment');
    expect(payments.some((p: any) => p.method === 'gift_card' && p.amount === 30)).toBe(true);
  });

  it('partially covers the order and never charges more than needed', async () => {
    const { token } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 50, quantity: 5, categoryId: cat.id });
    const card = await issueGiftCard(admin.token, 30);

    const res = await placeOrder(token, product.id, { giftCardCode: card.code });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('pending');
    expect(res.body.data.giftCardApplied).toBe(30);
    expect(res.body.data.totalAmount).toBe(50);
  });

  it('combines store credit and gift card (credit first, then card)', async () => {
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 100, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 40);
    const card = await issueGiftCard(admin.token, 40);

    const res = await placeOrder(token, product.id, { applyStoreCredit: true, giftCardCode: card.code });
    expect(res.status).toBe(201);
    expect(res.body.data.storeCreditApplied).toBe(40);
    expect(res.body.data.giftCardApplied).toBe(40);
    expect(res.body.data.totalAmount).toBe(100);
    // The card keeps 0 (it covered 40 of the remaining 60... capped at 40).
    const cards = peekMockStore('giftCard');
    expect(cards[0].balance).toBe(0);
  });

  it('rejects an unknown code WITHOUT creating the order', async () => {
    const { token } = await authHeader();
    const cat = await createCategory();
    const product = await createProduct({ price: 10, quantity: 5, categoryId: cat.id });

    const res = await placeOrder(token, product.id, { giftCardCode: 'XXXX-XXXX-XXXX-XXXX' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Gift card not found/i);
    expect(peekMockStore('order')).toHaveLength(0);
  });

  it('rejects an expired card', async () => {
    const { token } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 10, quantity: 5, categoryId: cat.id });
    const card = await issueGiftCard(admin.token, 10, {
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await placeOrder(token, product.id, { giftCardCode: card.code });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not redeemable/i);
    expect(peekMockStore('order')).toHaveLength(0);
  });

  it('rejects a card in a different currency', async () => {
    const { token } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 10, quantity: 5, categoryId: cat.id });
    const card = await issueGiftCard(admin.token, 10, { currency: 'EUR' });

    const res = await placeOrder(token, product.id, { giftCardCode: card.code });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/currency/i);
    expect(peekMockStore('order')).toHaveLength(0);
  });
});

describe('wallet credit vs online gateways', () => {
  async function seedStripe() {
    const gwConfig = JSON.stringify({
      stripe: { enabled: true, secretKey: 'sk_test_x', webhookSecret: 'whsec_x' },
    });
    await mockPrisma.storeSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', paymentGateways: gwConfig },
      update: { paymentGateways: gwConfig },
    });
  }

  it('refuses a PARTIAL wallet payment with a gateway method (400, no order)', async () => {
    await seedStripe();
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 50, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 20);

    const res = await placeOrder(token, product.id, {
      paymentMethod: 'stripe',
      applyStoreCredit: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot be combined/i);
    expect(peekMockStore('order')).toHaveLength(0);
  });

  it('allows a wallet payment that FULLY covers a gateway-method order and skips the session', async () => {
    await seedStripe();
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 50, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 50);

    const res = await placeOrder(token, product.id, {
      paymentMethod: 'stripe',
      applyStoreCredit: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('completed');
    expect(res.body.data.checkoutUrl).toBeNull();
    expect(res.body.data.storeCreditApplied).toBe(50);
  });
});

describe('refunds vs wallet credit', () => {
  it('credits the refund back to store credit with creditToStoreCredit=true', async () => {
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 40, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 40);

    const placed = await placeOrder(token, product.id, { applyStoreCredit: true });
    expect(placed.body.data.paymentStatus).toBe('completed');

    const refund = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ orderId: placed.body.data.id, creditToStoreCredit: true });
    expect(refund.status).toBe(200);

    // Balance restored, ledgered as a refund against the order.
    const rows = peekMockStore('storeCredit');
    expect(rows[0].balance).toBe(40);
    const txs = peekMockStore('storeCreditTransaction');
    expect(txs.some((t: any) => t.type === 'refund' && t.amount === 40 && t.orderId === placed.body.data.id)).toBe(true);
    const orders = peekMockStore('order');
    expect(orders[0].paymentStatus).toBe('refunded');
  });

  it('caps a CASH refund at the amount actually paid in cash', async () => {
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 50, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 10);

    const placed = await placeOrder(token, product.id, { applyStoreCredit: true });
    expect(placed.body.data.paymentStatus).toBe('pending');

    // Staff settle the remaining $40 cash (COD collection).
    const settled = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ orderId: placed.body.data.id, paymentMethod: 'cash_on_delivery' });
    expect(settled.status).toBe(200);

    // Without creditToStoreCredit, only the $40 cash portion can be
    // refunded; asking for the full $50 must fail (the $10 was credit,
    // never cash).
    const refund = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ orderId: placed.body.data.id, amount: 50 });
    expect(refund.status).toBe(400);
    expect(refund.body.message).toMatch(/cash/i);

    // The $40 cash portion still refunds.
    const partial = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ orderId: placed.body.data.id, amount: 40 });
    expect(partial.status).toBe(200);
  });
});

describe('mid-flight debit failure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reverses an already-applied store credit and deletes the order when the gift card debit fails', async () => {
    // Simulate the narrow race: the card passed pre-validation but a
    // concurrent order drained it before debitGiftCard ran. The store
    // credit was already debited at that point, so the route must
    // reverse it, delete the just-created order, and surface the error
    // — otherwise the credit is spent on an order that never completed.
    const spy = vi
      .spyOn(giftcardService, 'debitGiftCard')
      .mockRejectedValueOnce(new AppError('Insufficient balance: card has 0, requested 20', 400));

    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    // EUR store: the reversal must put the credit back in EUR (the same
    // currency the debit took), not an invisible USD row.
    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ storeName: 'EUR Shop', currency: 'EUR' });
    const cat = await createCategory();
    const product = await createProduct({ price: 20, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 10);
    const card = await issueGiftCard(admin.token, 50, { currency: 'EUR' });

    const res = await placeOrder(token, product.id, {
      applyStoreCredit: true,
      giftCardCode: card.code,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient/i);
    expect(spy).toHaveBeenCalledTimes(1);

    // No order row survives (items cascade with it), the store credit
    // is back at its pre-order balance IN THE SAME CURRENCY, and the
    // card was never debited.
    expect(peekMockStore('order')).toHaveLength(0);
    const credits = peekMockStore('storeCredit');
    expect(credits).toHaveLength(1);
    expect(credits[0].currency).toBe('EUR');
    expect(credits[0].balance).toBe(10);
    const txs = peekMockStore('storeCreditTransaction');
    // The reversal is the adjust row linked to the (now deleted) order;
    // the admin grant is also 'adjust' but has no orderId.
    expect(txs.filter((t: any) => t.type === 'adjust' && t.amount === 10 && t.orderId)).toHaveLength(1);
    const cards = peekMockStore('giftCard');
    expect(cards[0].balance).toBe(50);
    expect(peekMockStore('giftCardTransaction').some((t: any) => t.type === 'use')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Concurrency: the balance movements must be atomic. Two concurrent orders
// must never spend the same balance twice (the old read-modify-write let
// both read the same balance and both write their own result).
// ---------------------------------------------------------------------------
describe('concurrent wallet movements', () => {
  it('two concurrent store-credit debits never overspend the balance', async () => {
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    await grantStoreCredit(admin.token, user.id, 100);

    const [a, b] = await Promise.all([
      debitStoreCredit({ userId: user.id, amount: 60, currency: 'USD' }),
      debitStoreCredit({ userId: user.id, amount: 60, currency: 'USD' }),
    ]);

    // 100 balance can only be spent once: 60 + 40, never 60 + 60.
    expect(Math.round((a.applied + b.applied) * 100) / 100).toBe(100);
    const rows = peekMockStore('storeCredit');
    expect(rows[0].balance).toBe(0);
    const uses = peekMockStore('storeCreditTransaction').filter((t: any) => t.type === 'order_use');
    expect(uses.reduce((s: number, t: any) => s + t.amount, 0)).toBe(-100);
  });

  it('two concurrent store-credit credits both land (single row, no lost update)', async () => {
    const { user } = await authHeader();

    await Promise.all([
      creditStoreCredit({ userId: user.id, amount: 25, currency: 'USD' }),
      creditStoreCredit({ userId: user.id, amount: 30, currency: 'USD' }),
    ]);

    // Exactly ONE balance row — the race-free upsert must not let the two
    // first-time credits create duplicate rows.
    const rows = peekMockStore('storeCredit');
    expect(rows).toHaveLength(1);
    expect(rows[0].balance).toBe(55);
    expect(peekMockStore('storeCreditTransaction')).toHaveLength(2);
  });

  it('two concurrent gift-card debits never overspend the card', async () => {
    const admin = await authHeader({ role: 'admin' });
    const card = await issueGiftCard(admin.token, 100);

    const results = await Promise.allSettled([
      giftcardService.debitGiftCard({ code: card.code, amount: 60 }),
      giftcardService.debitGiftCard({ code: card.code, amount: 60 }),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const cards = peekMockStore('giftCard');
    expect(cards[0].balance).toBe(40);
    // One use ledger row of -60.
    expect(peekMockStore('giftCardTransaction').filter((t: any) => t.type === 'use')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Currency correctness: store credit is per-currency, and every movement
// must land in the STORE's currency — never a hardcoded 'USD' row that the
// checkout (which reads the store-currency balance) can never spend.
// ---------------------------------------------------------------------------
describe('store credit currency handling', () => {
  async function makeEurStore() {
    const admin = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ storeName: 'EUR Shop', currency: 'EUR' });
    return admin;
  }

  it('GET /store-credit defaults to the store currency, not USD', async () => {
    const admin = await makeEurStore();
    const { token, user } = await authHeader();
    // Grant EUR credit (explicit currency), then read without a param.
    await request(app)
      .post('/api/store-credit')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: user.id, amount: 42, currency: 'EUR' });

    const res = await request(app)
      .get('/api/store-credit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.currency).toBe('EUR');
    expect(res.body.data.balance).toBe(42);
  });

  it('admin grant without a currency lands in the store currency', async () => {
    const admin = await makeEurStore();
    const { token, user } = await authHeader();

    const res = await request(app)
      .post('/api/store-credit')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: user.id, amount: 20 });
    expect(res.status).toBe(201);

    const rows = peekMockStore('storeCredit');
    expect(rows).toHaveLength(1);
    expect(rows[0].currency).toBe('EUR');
    expect(rows[0].balance).toBe(20);
  });

  it('positive adjust respects the requested currency', async () => {
    const admin = await authHeader({ role: 'admin' });
    const { token, user } = await authHeader();

    const res = await request(app)
      .post('/api/store-credit/adjust')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: user.id, amount: 15, currency: 'EUR', reason: 'goodwill' });
    expect(res.status).toBe(200);

    const rows = peekMockStore('storeCredit');
    expect(rows).toHaveLength(1);
    expect(rows[0].currency).toBe('EUR');
    expect(rows[0].balance).toBe(15);
  });

  it('refund creditToStoreCredit lands in the store currency', async () => {
    const admin = await makeEurStore();
    const { token, user } = await authHeader();
    const cat = await createCategory();
    const product = await createProduct({ price: 10, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 10);

    const placed = await placeOrder(token, product.id, { applyStoreCredit: true });
    expect(placed.status).toBe(201);
    expect(placed.body.data.paymentStatus).toBe('completed');

    const refund = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ orderId: placed.body.data.id, amount: 10, creditToStoreCredit: true });
    expect(refund.status).toBe(200);

    const rows = peekMockStore('storeCredit');
    expect(rows).toHaveLength(1);
    expect(rows[0].currency).toBe('EUR');
    expect(rows[0].balance).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Accounting: wallet payments move no cash, so the journal must not pretend
// they did — sales debit customer deposits (2200), store-credit refunds
// credit customer deposits (2200) instead of the gateway account (1200).
// ---------------------------------------------------------------------------
describe('wallet payments in the accounting journal', () => {
  let tempDir = '';
  afterEach(() => {
    delete process.env.ACCOUNTING_AUTO_POST;
    if (process.env.ACCOUNTING_DIR) {
      delete process.env.ACCOUNTING_DIR;
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function accountCodeById(): Promise<Map<string, string>> {
    const raw = fs.readFileSync(path.join(tempDir, 'accounts.json'), 'utf8');
    return new Map((JSON.parse(raw) as any[]).map((a) => [a.id, a.code]));
  }

  it('posts a wallet-covered sale to customer deposits, not the gateway account', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-accounting-'));
    process.env.ACCOUNTING_DIR = tempDir;
    process.env.ACCOUNTING_AUTO_POST = 'true';
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 30, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 30);

    const placed = await placeOrder(token, product.id, { applyStoreCredit: true });
    expect(placed.status).toBe(201);
    expect(placed.body.data.paymentStatus).toBe('completed');

    const entries = await request(app)
      .get('/api/accounting/entries')
      .set('Authorization', `Bearer ${admin.token}`);
    const sale = entries.body.data.find((e: any) => e.reference === placed.body.data.orderNumber);
    expect(sale).toBeTruthy();
    const byCode = await accountCodeById();
    const debitLine = sale.lines.find((l: any) => l.debit > 0);
    expect(byCode.get(debitLine.accountId)).toBe('2200');
  });

  it('posts a creditToStoreCredit refund to customer deposits, not the gateway account', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-accounting-'));
    process.env.ACCOUNTING_DIR = tempDir;
    process.env.ACCOUNTING_AUTO_POST = 'true';
    const { token, user } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const product = await createProduct({ price: 50, quantity: 5, categoryId: cat.id });
    await grantStoreCredit(admin.token, user.id, 10);

    const placed = await placeOrder(token, product.id, { applyStoreCredit: true });
    expect(placed.status).toBe(201);
    expect(placed.body.data.paymentStatus).toBe('pending');

    // Settle the $40 cash remainder like a COD collection, then refund
    // everything to store credit.
    await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ orderId: placed.body.data.id, paymentMethod: 'cash_on_delivery' });
    const refund = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ orderId: placed.body.data.id, amount: 50, creditToStoreCredit: true });
    expect(refund.status).toBe(200);

    const entries = await request(app)
      .get('/api/accounting/entries')
      .set('Authorization', `Bearer ${admin.token}`);
    const refundEntry = entries.body.data.find(
      (e: any) => e.memo.includes('Refund') && e.reference === placed.body.data.id,
    );
    expect(refundEntry).toBeTruthy();
    const byCode = await accountCodeById();
    const creditLine = refundEntry.lines.find((l: any) => l.credit > 0);
    expect(byCode.get(creditLine.accountId)).toBe('2200');
  });
});
