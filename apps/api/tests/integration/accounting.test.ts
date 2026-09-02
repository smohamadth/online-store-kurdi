// ---------------------------------------------------------------------------
// Accounting integration tests — file-based double-entry API.
//
//   - only admins/managers may touch it (403 for customers)
//   - the default chart of accounts is seeded on first read
//   - posting a journal entry enforces the double-entry invariant (a 400 for
//     anything that doesn't balance)
//   - the trial balance, income statement and balance sheet derive from the
//     posted entries, and the balance sheet balances
//   - accounts with postings can be deactivated but not deleted; system
//     accounts can never be deleted
//
// All file I/O goes to a per-run temp directory (ACCOUNTING_DIR).
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createOrder } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
let tempDir: string;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-test-'));
  process.env.ACCOUNTING_DIR = tempDir;
  app = await getTestApp();
});

afterAll(async () => {
  await mockPrisma.$disconnect();
  if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.ACCOUNTING_DIR;
});

beforeEach(async () => { await cleanDatabase(); });
afterEach(async () => {
  for (const e of fs.readdirSync(tempDir)) fs.rmSync(path.join(tempDir, e), { recursive: true, force: true });
});

async function adminGet(url: string) {
  const { token } = await authHeader({ role: 'admin' });
  return request(app).get(url).set('Authorization', `Bearer ${token}`);
}

async function findAccount(accounts: any[], code: string) {
  return accounts.find((a: any) => a.code === code);
}

/** Post a simple balanced entry debiting cash against sales revenue. */
async function postSale(amount: number, ref?: string) {
  const { token } = await authHeader({ role: 'admin' });
  const accs = (await adminGet('/api/accounting/accounts')).body.data;
  const cash = await findAccount(accs, '1000');
  const sales = await findAccount(accs, '4000');
  return request(app)
    .post('/api/accounting/entries')
    .set('Authorization', `Bearer ${token}`)
    .send({
      date: '2024-01-15',
      memo: 'Test sale',
      reference: ref,
      lines: [
        { accountId: cash.id, debit: amount },
        { accountId: sales.id, credit: amount },
      ],
    });
}

describe('access control', () => {
  it('rejects a customer (403) on every route', async () => {
    const { token } = await authHeader();
    for (const url of ['/api/accounting/accounts', '/api/accounting/entries', '/api/accounting/reports/balance-sheet']) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });
});

describe('chart of accounts', () => {
  it('seeds the default chart on first read', async () => {
    const res = await adminGet('/api/accounting/accounts');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(20);
    expect(await findAccount(res.body.data, '1000')).toBeTruthy();
    expect(await findAccount(res.body.data, '4000')).toBeTruthy();
  });

  it('creates and updates an account', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app)
      .post('/api/accounting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '5900', name: 'Consulting fees', type: 'expense' });
    expect(created.status).toBe(200);
    expect(created.body.data.normalSide).toBe('debit');

    const updated = await request(app)
      .put(`/api/accounting/accounts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Consulting & legal fees' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Consulting & legal fees');
  });

  it('rejects a duplicate code and an invalid type', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const dup = await request(app)
      .post('/api/accounting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '4000', name: 'Duplicate', type: 'revenue' });
    expect(dup.status).toBe(400);

    const bad = await request(app)
      .post('/api/accounting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '5900', name: 'Bad', type: 'bogus' });
    expect(bad.status).toBe(400);
  });

  it('refuses to delete a system account', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const accs = (await adminGet('/api/accounting/accounts')).body.data;
    const cash = await findAccount(accs, '1000');
    const res = await request(app)
      .delete(`/api/accounting/accounts/${cash.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('deactivates but does not delete a posted account', async () => {
    const { token } = await authHeader({ role: 'admin' });
    // Create a brand-new expense account, post to it, then verify it can only
    // be deactivated (not deleted) because it now carries postings.
    const created = await request(app)
      .post('/api/accounting/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '5900', name: 'Consulting fees', type: 'expense' });
    const accs = (await adminGet('/api/accounting/accounts')).body.data;
    const cash = await findAccount(accs, '1000');
    const other = created.body.data;

    await request(app)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-01-15',
        memo: 'Consulting bill',
        lines: [
          { accountId: other.id, debit: 40 },
          { accountId: cash.id, credit: 40 },
        ],
      });

    const del = await request(app)
      .delete(`/api/accounting/accounts/${other.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(400);

    const deact = await request(app)
      .put(`/api/accounting/accounts/${other.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false });
    expect(deact.status).toBe(200);
    expect(deact.body.data.active).toBe(false);
  });
});

describe('journal', () => {
  it('posts a balanced entry and lists it', async () => {
    const res = await postSale(100, 'ORD-1');
    expect(res.status).toBe(200);
    expect(res.body.data.reference).toBe('ORD-1');

    const list = await adminGet('/api/accounting/entries');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(res.body.data.id);

    const one = await adminGet(`/api/accounting/entries/${res.body.data.id}`);
    expect(one.status).toBe(200);
  });

  it('rejects an unbalanced entry', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const accs = (await adminGet('/api/accounting/accounts')).body.data;
    const cash = await findAccount(accs, '1000');
    const sales = await findAccount(accs, '4000');
    const res = await request(app)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-01-15',
        memo: 'Unbalanced',
        lines: [
          { accountId: cash.id, debit: 100 },
          { accountId: sales.id, credit: 99 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ENTRY');
  });

  it('rejects posting to a closed account', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const accs = (await adminGet('/api/accounting/accounts')).body.data;
    const software = accs.find((a: any) => a.code === '5400');
    // Close it, then try to post to it.
    await request(app).put(`/api/accounting/accounts/${software.id}`).set('Authorization', `Bearer ${token}`).send({ active: false });
    const res = await request(app)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-01-15',
        memo: 'Closed',
        lines: [
          { accountId: software.id, debit: 5 },
          { accountId: (await findAccount(accs, '1000')).id, credit: 5 },
        ],
      });
    expect(res.status).toBe(400);
  });
});

describe('reports', () => {
  it('trial balance grand totals are equal', async () => {
    await postSale(250);
    await postSale(100);
    const res = await adminGet('/api/accounting/reports/trial-balance');
    const debit = res.body.data.reduce((s: number, r: any) => s + r.debit, 0);
    const credit = res.body.data.reduce((s: number, r: any) => s + r.credit, 0);
    expect(debit).toBe(credit);
    expect(debit).toBe(350);
  });

  it('income statement reports net income', async () => {
    await postSale(400);
    const res = await adminGet('/api/accounting/reports/income-statement');
    expect(res.body.data.totalRevenue).toBe(400);
    expect(res.body.data.netIncome).toBe(400);
  });

  it('balance sheet balances', async () => {
    await postSale(300);
    const res = await adminGet('/api/accounting/reports/balance-sheet');
    expect(res.body.data.balanced).toBe(true);
    expect(res.body.data.balancingDifference).toBe(0);
  });

  it('general ledger lists posting rows with a running balance', async () => {
    await postSale(75);
    await postSale(25);
    const accs = (await adminGet('/api/accounting/accounts')).body.data;
    const cash = await findAccount(accs, '1000');
    const res = await adminGet(`/api/accounting/ledger/${cash.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows.length).toBe(2);
    // Running balance accumulates on the debit (asset) side.
    expect(res.body.data.rows[0].runningBalance).toBe(75);
    expect(res.body.data.rows[1].runningBalance).toBe(100);
  });
});

describe('date-range reporting', () => {
  it('filters the income statement to an inclusive range', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const accs = (await adminGet('/api/accounting/accounts')).body.data;
    const cash = await findAccount(accs, '1000');
    const sales = await findAccount(accs, '4000');
    const post = (date: string, amount: number) =>
      request(app)
        .post('/api/accounting/entries')
        .set('Authorization', `Bearer ${token}`)
        .send({ date, memo: `sale ${date}`, lines: [
          { accountId: cash.id, debit: amount },
          { accountId: sales.id, credit: amount },
        ] });
    await post('2024-01-01', 100);
    await post('2024-01-31', 200);
    await post('2024-02-15', 300);

    const res = await adminGet('/api/accounting/reports/income-statement?from=2024-01-01&to=2024-01-31');
    expect(res.status).toBe(200);
    expect(res.body.data.totalRevenue).toBe(300);
  });

  it('rejects an invalid date range with 400 INVALID_RANGE', async () => {
    const res = await adminGet('/api/accounting/reports/income-statement?from=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RANGE');
  });

  it('rejects a range where from is after to', async () => {
    const res = await adminGet('/api/accounting/reports/trial-balance?from=2024-03-01&to=2024-01-01');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RANGE');
  });
});

describe('reversing entries', () => {
  it('posts an exact offsetting entry that nets the account to zero', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const posted = await postSale(50);
    expect(posted.status).toBe(200);
    const entryId = posted.body.data.id;

    const rev = await request(app)
      .post(`/api/accounting/entries/${entryId}/reverse`)
      .set('Authorization', `Bearer ${token}`);
    expect(rev.status).toBe(200);
    expect(rev.body.data.memo).toMatch(/REVERSE/);

    // Cash should now net to zero.
    const accs = (await adminGet('/api/accounting/accounts')).body.data;
    const cash = await findAccount(accs, '1000');
    const bal = await adminGet('/api/accounting/reports/balances');
    const cashBal = bal.body.data.find((b: any) => b.account.id === cash.id);
    expect(cashBal.balance).toBe(0);
  });

  it('400s when reversing a missing entry', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/accounting/entries/missing/reverse')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('400s when reversing a voided entry (phantom-offset guard)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const posted = await postSale(50);
    const entryId = posted.body.data.id;

    const voidRes = await request(app)
      .post(`/api/accounting/entries/${entryId}/void`)
      .set('Authorization', `Bearer ${token}`);
    expect(voidRes.status).toBe(200);

    // Regression: the old code reversed ANY entry, so a reversal of a
    // voided entry posted a live offset for an entry that no longer
    // counts — distorting every balance and the balance sheet.
    const rev = await request(app)
      .post(`/api/accounting/entries/${entryId}/reverse`)
      .set('Authorization', `Bearer ${token}`);
    expect(rev.status).toBe(400);
    expect(rev.body.code).toBe('REVERSE_FAILED');

    // Nothing was posted: the journal has exactly the one (voided) entry.
    const list = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.filter((e: any) => !e.voided)).toHaveLength(0);
  });

  it('400s when reversing a closing entry', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await postSale(200);
    const close = await request(app)
      .post('/api/accounting/entries/close-year/2024')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(close.status).toBe(200);

    const rev = await request(app)
      .post(`/api/accounting/entries/${close.body.data.id}/reverse`)
      .set('Authorization', `Bearer ${token}`);
    expect(rev.status).toBe(400);
    expect(rev.body.code).toBe('REVERSE_FAILED');
  });
});

describe('order → journal', () => {
  async function makeUserAndOrder(opts: any = {}) {
    const { token, user } = await authHeader({ role: 'admin' });
    const order = await createOrder(user.id, {
      subtotal: 100,
      taxAmount: 10,
      shippingAmount: 5,
      totalAmount: 115,
      paymentStatus: opts.paymentStatus ?? 'paid',
    });
    return { token, order };
  }

  it('suggests a balanced sale entry for a paid order (no write)', async () => {
    const { token, order } = await makeUserAndOrder({ paymentStatus: 'paid' });
    const res = await request(app)
      .get(`/api/accounting/orders/${order.id}/suggest`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const entry = res.body.data.entry;
    expect(entry.reference).toBe(order.orderNumber);
    const debit = entry.lines.reduce((s: number, l: any) => s + l.debit, 0);
    const credit = entry.lines.reduce((s: number, l: any) => s + l.credit, 0);
    expect(debit).toBe(credit);
    // Nothing was posted by the suggest call.
    const list = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toHaveLength(0);
  });

  it('posts a sale entry and refuses a double-post', async () => {
    const { token, order } = await makeUserAndOrder();
    const post = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(200);
    expect(post.body.data.reference).toBe(order.orderNumber);

    const again = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('POST_ORDER_FAILED');
  });

  it('posts an unpaid order to accounts receivable', async () => {
    const { token, order } = await makeUserAndOrder({ paymentStatus: 'pending' });
    const accs = (await request(app).get('/api/accounting/accounts').set('Authorization', `Bearer ${token}`)).body.data;
    const ar = accs.find((a: any) => a.code === '1300');
    const res = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lines.some((l: any) => l.accountId === ar.id && l.debit > 0)).toBe(true);
  });
});

describe('order → journal: debit mapping by payment method', () => {
  async function adminToken() {
    return (await authHeader({ role: 'admin' })).token;
  }
  async function chart() {
    return (await adminGet('/api/accounting/accounts')).body.data;
  }

  it('debited the gateway for every paid order before this fix; now maps by method', async () => {
    const token = await adminToken();
    const accs = await chart();
    const bank = accs.find((a: any) => a.code === '1100');
    const cash = accs.find((a: any) => a.code === '1000');
    const gateway = accs.find((a: any) => a.code === '1200');
    const user = (await authHeader({ role: 'admin' })).user;

    // Bank transfer -> bank account, not the gateway balance.
    const bankOrder = await createOrder(user.id, { paymentStatus: 'paid', paymentMethod: 'bank_transfer', subtotal: 90, taxAmount: 10, totalAmount: 100 });
    const bankPost = await request(app)
      .post(`/api/accounting/orders/${bankOrder.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(bankPost.status).toBe(200);
    expect(bankPost.body.data.lines.some((l: any) => l.accountId === bank.id && l.debit === 100)).toBe(true);
    expect(bankPost.body.data.lines.some((l: any) => l.accountId === gateway.id)).toBe(false);

    // COD -> cash on hand.
    const codOrder = await createOrder(user.id, { paymentStatus: 'paid', paymentMethod: 'cash_on_delivery', subtotal: 50, taxAmount: 0, totalAmount: 50 });
    const codPost = await request(app)
      .post(`/api/accounting/orders/${codOrder.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(codPost.status).toBe(200);
    expect(codPost.body.data.lines.some((l: any) => l.accountId === cash.id && l.debit === 50)).toBe(true);

    // Gateway method -> gateway account (unchanged behaviour).
    const gwOrder = await createOrder(user.id, { paymentStatus: 'paid', paymentMethod: 'stripe', subtotal: 30, taxAmount: 0, totalAmount: 30 });
    const gwPost = await request(app)
      .post(`/api/accounting/orders/${gwOrder.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(gwPost.status).toBe(200);
    expect(gwPost.body.data.lines.some((l: any) => l.accountId === gateway.id && l.debit === 30)).toBe(true);
  });

  it('splits the debit: wallet-applied credit -> deposits, remainder -> method asset', async () => {
    const token = await adminToken();
    const accs = await chart();
    const deposits = accs.find((a: any) => a.code === '2200');
    const cash = accs.find((a: any) => a.code === '1000');
    const user = (await authHeader({ role: 'admin' })).user;

    // $100 COD order, $40 covered by gift card at checkout: the sale entry
    // must debit deposits $40 (prepaid value consumed) and cash $60 — NOT
    // cash $100 (the old behaviour booked money the store never collected).
    const order = await createOrder(user.id, {
      paymentStatus: 'paid',
      paymentMethod: 'cash_on_delivery',
      subtotal: 90,
      taxAmount: 10,
      totalAmount: 100,
      giftCardApplied: 40,
    });
    const post = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(200);
    const lines = post.body.data.lines;
    expect(lines.some((l: any) => l.accountId === deposits.id && l.debit === 40)).toBe(true);
    expect(lines.some((l: any) => l.accountId === cash.id && l.debit === 60)).toBe(true);

    // The entry balances and the balance sheet stays balanced.
    const debit = lines.reduce((s: number, l: any) => s + l.debit, 0);
    const credit = lines.reduce((s: number, l: any) => s + l.credit, 0);
    expect(debit).toBe(credit);
  });

  it('a fully wallet-covered order debits deposits only', async () => {
    const token = await adminToken();
    const accs = await chart();
    const deposits = accs.find((a: any) => a.code === '2200');
    const cash = accs.find((a: any) => a.code === '1000');
    const user = (await authHeader({ role: 'admin' })).user;

    const order = await createOrder(user.id, {
      paymentStatus: 'paid',
      paymentMethod: 'stripe', // selected card but fully covered by credit
      subtotal: 80,
      taxAmount: 0,
      totalAmount: 80,
      storeCreditApplied: 80,
    });
    const post = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(200);
    const lines = post.body.data.lines;
    expect(lines.some((l: any) => l.accountId === deposits.id && l.debit === 80)).toBe(true);
    expect(lines.some((l: any) => l.accountId === cash.id)).toBe(false);
  });

  it('refuses to post an order whose totals do not reconcile (invariant defense)', async () => {
    const token = await adminToken();
    const user = (await authHeader({ role: 'admin' })).user;
    // subtotal 100 + tax 10 = 110, but totalAmount says 100 — the built
    // entry would be unbalanced. Regression: postOrderEntry used to skip
    // validateJournalEntry and wrote the unbalanced entry straight into
    // the ledger, breaking the double-entry invariant at the source.
    const order = await createOrder(user.id, { paymentStatus: 'paid', subtotal: 100, taxAmount: 10, totalAmount: 100 });
    const post = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(400);
    expect(post.body.code).toBe('POST_ORDER_FAILED');
    // Nothing was written.
    const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    expect(entries.body.data).toHaveLength(0);
  });

  it('an unpaid wallet+COD order splits between deposits and accounts receivable', async () => {
    const token = await adminToken();
    const accs = await chart();
    const deposits = accs.find((a: any) => a.code === '2200');
    const ar = accs.find((a: any) => a.code === '1300');
    const user = (await authHeader({ role: 'admin' })).user;

    const order = await createOrder(user.id, {
      paymentStatus: 'pending',
      paymentMethod: 'cash_on_delivery',
      subtotal: 90,
      taxAmount: 10,
      totalAmount: 100,
      storeCreditApplied: 25,
    });
    const post = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(200);
    const lines = post.body.data.lines;
    expect(lines.some((l: any) => l.accountId === deposits.id && l.debit === 25)).toBe(true);
    expect(lines.some((l: any) => l.accountId === ar.id && l.debit === 75)).toBe(true);
  });
});

describe('re-posting an order after a correction (void / reverse)', () => {
  async function postOrderAndReturnId() {
    const token = (await authHeader({ role: 'admin' })).token;
    const user = (await authHeader({ role: 'admin' })).user;
    const order = await createOrder(user.id, { paymentStatus: 'paid', subtotal: 90, taxAmount: 10, totalAmount: 100 });
    const post = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(200);
    return { token, order, entryId: post.body.data.id };
  }

  it('post -> void -> post again: the correction must not orphan the order', async () => {
    const { token, order } = await postOrderAndReturnId();
    const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    const saleId = entries.body.data[0].id;

    const voidRes = await request(app)
      .post(`/api/accounting/entries/${saleId}/void`)
      .set('Authorization', `Bearer ${token}`);
    expect(voidRes.status).toBe(200);

    // Regression: the old double-post guard matched ANY row with the
    // order's reference — including the voided one — so a corrected
    // posting was impossible without hand-editing the journal file.
    const repost = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(repost.status).toBe(200);
    expect(repost.body.data.reference).toBe(order.orderNumber);
  });

  it('post -> reverse -> post again: a reversed order can be re-posted', async () => {
    const { token, order } = await postOrderAndReturnId();
    const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    const saleId = entries.body.data[0].id;

    const rev = await request(app)
      .post(`/api/accounting/entries/${saleId}/reverse`)
      .set('Authorization', `Bearer ${token}`);
    expect(rev.status).toBe(200);

    const repost = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(repost.status).toBe(200);

    // Exactly one live sale posting remains (original is offset).
    const list = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    const liveSales = list.body.data.filter(
      (e: any) => e.reference === order.orderNumber && !e.voided && !e.reversedById && !e.reversalOf,
    );
    expect(liveSales).toHaveLength(1);
  });

  it('voiding a reversal un-reverses the original (it counts again)', async () => {
    const { token, order } = await postOrderAndReturnId();
    const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    const saleId = entries.body.data[0].id;
    const rev = await request(app)
      .post(`/api/accounting/entries/${saleId}/reverse`)
      .set('Authorization', `Bearer ${token}`);
    const reversalId = rev.body.data.id;

    const voidRev = await request(app)
      .post(`/api/accounting/entries/${reversalId}/void`)
      .set('Authorization', `Bearer ${token}`);
    expect(voidRev.status).toBe(200);

    // The original is live again -> re-posting is refused (already posted).
    const repost = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(repost.status).toBe(400);
    expect(repost.body.code).toBe('POST_ORDER_FAILED');
  });

  it('refuses to void an entry that has a live reversal (phantom-offset guard)', async () => {
    const { token } = await postOrderAndReturnId();
    const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    const saleId = entries.body.data[0].id;
    await request(app)
      .post(`/api/accounting/entries/${saleId}/reverse`)
      .set('Authorization', `Bearer ${token}`);

    const voidRes = await request(app)
      .post(`/api/accounting/entries/${saleId}/void`)
      .set('Authorization', `Bearer ${token}`);
    expect(voidRes.status).toBe(400);
    expect(voidRes.body.code).toBe('VOID_FAILED');
  });

  it('refuses to reverse a reversing entry', async () => {
    const { token } = await postOrderAndReturnId();
    const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    const saleId = entries.body.data[0].id;
    const rev = await request(app)
      .post(`/api/accounting/entries/${saleId}/reverse`)
      .set('Authorization', `Bearer ${token}`);

    const again = await request(app)
      .post(`/api/accounting/entries/${rev.body.data.id}/reverse`)
      .set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('REVERSE_FAILED');
  });

  it('reversing an entry with a max-length memo still works (memo cap)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const accs = await (await adminGet('/api/accounting/accounts')).body.data;
    const cash = accs.find((a: any) => a.code === '1000');
    const sales = accs.find((a: any) => a.code === '4000');
    const longMemo = 'x'.repeat(240);
    const post = await request(app)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-05-01',
        memo: longMemo,
        lines: [
          { accountId: cash.id, debit: 10 },
          { accountId: sales.id, credit: 10 },
        ],
      });
    expect(post.status).toBe(200);

    // Regression: 'REVERSE — ' + 240 chars exceeded the 240-char memo cap
    // and the reversal was rejected, stranding the entry.
    const rev = await request(app)
      .post(`/api/accounting/entries/${post.body.data.id}/reverse`)
      .set('Authorization', `Bearer ${token}`);
    expect(rev.status).toBe(200);
    expect(rev.body.data.memo.length).toBeLessThanOrEqual(240);
  });
});

describe('refund auto-posting credits the method asset', () => {
  it('a bank-transfer order refunded in cash credits the bank account', async () => {
    process.env.ACCOUNTING_AUTO_POST = 'true';
    try {
      const token = (await authHeader({ role: 'admin' })).token;
      const user = (await authHeader({ role: 'admin' })).user;
      const order = await createOrder(user.id, {
        paymentStatus: 'completed',
        paymentMethod: 'bank_transfer',
        subtotal: 90,
        taxAmount: 10,
        totalAmount: 100,
      });
      const refund = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, reason: 'return' });
      expect(refund.status).toBe(200);

      const accs = (await adminGet('/api/accounting/accounts')).body.data;
      const bank = accs.find((a: any) => a.code === '1100');
      const gateway = accs.find((a: any) => a.code === '1200');
      const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
      const refundEntry = entries.body.data.find((e: any) => e.memo.includes('Refund'));
      expect(refundEntry).toBeTruthy();
      expect(refundEntry.memo).toContain(order.orderNumber); // human-readable, not a UUID
      expect(refundEntry.lines.some((l: any) => l.accountId === bank.id && l.credit === 100)).toBe(true);
      expect(refundEntry.lines.some((l: any) => l.accountId === gateway.id)).toBe(false);
    } finally {
      delete process.env.ACCOUNTING_AUTO_POST;
    }
  });

  it('a creditToStoreCredit refund credits customer deposits (not the gateway)', async () => {
    process.env.ACCOUNTING_AUTO_POST = 'true';
    try {
      const token = (await authHeader({ role: 'admin' })).token;
      const user = (await authHeader({ role: 'admin' })).user;
      const order = await createOrder(user.id, {
        paymentStatus: 'completed',
        paymentMethod: 'stripe',
        subtotal: 90,
        taxAmount: 10,
        totalAmount: 100,
      });
      const refund = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, reason: 'return', creditToStoreCredit: true });
      expect(refund.status).toBe(200);

      const accs = (await adminGet('/api/accounting/accounts')).body.data;
      const deposits = accs.find((a: any) => a.code === '2200');
      const gateway = accs.find((a: any) => a.code === '1200');
      const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
      const refundEntry = entries.body.data.find((e: any) => e.memo.includes('Refund'));
      expect(refundEntry.lines.some((l: any) => l.accountId === deposits.id && l.credit === 100)).toBe(true);
      expect(refundEntry.lines.some((l: any) => l.accountId === gateway.id)).toBe(false);
    } finally {
      delete process.env.ACCOUNTING_AUTO_POST;
    }
  });
});

describe('deposit issuance auto-posting', () => {
  async function withAutoPost<T>(fn: () => Promise<T>): Promise<T> {
    process.env.ACCOUNTING_AUTO_POST = 'true';
    try {
      return await fn();
    } finally {
      delete process.env.ACCOUNTING_AUTO_POST;
    }
  }
  async function journalEntries(token: string) {
    return (
      await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`)
    ).body.data;
  }
  async function chart() {
    return (await adminGet('/api/accounting/accounts')).body.data;
  }

  it('posts a goodwill store-credit grant against marketing (5300) and deposits (2200)', async () => {
    await withAutoPost(async () => {
      const { token } = await authHeader({ role: 'admin' });
      const user = (await authHeader({ role: 'customer' })).user;
      const grant = await request(app)
        .post('/api/store-credit')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: user.id, amount: 50, type: 'goodwill', notes: 'apology credit' });
      expect(grant.status).toBe(201);

      const accs = await chart();
      const marketing = accs.find((a: any) => a.code === '5300');
      const deposits = accs.find((a: any) => a.code === '2200');
      const entries = await journalEntries(token);
      expect(entries).toHaveLength(1);
      expect(entries[0].memo).toContain('goodwill');
      expect(entries[0].lines.some((l: any) => l.accountId === marketing.id && l.debit === 50)).toBe(true);
      expect(entries[0].lines.some((l: any) => l.accountId === deposits.id && l.credit === 50)).toBe(true);
    });
  });

  it('posts a gift-card issuance and a top-up as deposit liability increases', async () => {
    await withAutoPost(async () => {
      const { token } = await authHeader({ role: 'admin' });
      const issue = await request(app)
        .post('/api/gift-cards')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 25, notes: 'birthday promo' });
      expect(issue.status).toBe(201);
      const topup = await request(app)
        .post(`/api/gift-cards/${issue.body.data.id}/credit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10, type: 'adjust', notes: 'extra value' });
      expect(topup.status).toBe(200);

      const accs = await chart();
      const marketing = accs.find((a: any) => a.code === '5300');
      const deposits = accs.find((a: any) => a.code === '2200');
      const entries = await journalEntries(token);
      expect(entries).toHaveLength(2);
      for (const e of entries) {
        expect(e.lines.some((l: any) => l.accountId === marketing.id && l.debit > 0)).toBe(true);
        expect(e.lines.some((l: any) => l.accountId === deposits.id && l.credit > 0)).toBe(true);
      }
      const totalDebit = entries.reduce(
        (s: number, e: any) => s + e.lines.reduce((x: number, l: any) => x + l.debit, 0),
        0,
      );
      expect(totalDebit).toBe(35);
    });
  });

  it('posts a negative store-credit adjust as the mirror (debit deposits, credit marketing)', async () => {
    await withAutoPost(async () => {
      const { token } = await authHeader({ role: 'admin' });
      const user = (await authHeader({ role: 'customer' })).user;
      await request(app)
        .post('/api/store-credit')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: user.id, amount: 100, type: 'goodwill' });
      const adj = await request(app)
        .post('/api/store-credit/adjust')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: user.id, amount: -30, reason: 'over-grant corrected' });
      expect(adj.status).toBe(200);

      const accs = await chart();
      const marketing = accs.find((a: any) => a.code === '5300');
      const deposits = accs.find((a: any) => a.code === '2200');
      const entries = await journalEntries(token);
      expect(entries).toHaveLength(2);
      // The reduction is the entry that DEBITS deposits (the grant credits
      // it); its memo carries the admin's reason.
      const reduction = entries.find((e: any) =>
        e.lines.some((l: any) => l.accountId === deposits.id && l.debit > 0),
      );
      expect(reduction).toBeTruthy();
      expect(reduction.memo).toContain('over-grant corrected');
      expect(reduction.lines.some((l: any) => l.accountId === deposits.id && l.debit === 30)).toBe(true);
      expect(reduction.lines.some((l: any) => l.accountId === marketing.id && l.credit === 30)).toBe(true);
    });
  });

  it('honours an explicit accountCode override on the contra side', async () => {
    await withAutoPost(async () => {
      const { token } = await authHeader({ role: 'admin' });
      const user = (await authHeader({ role: 'customer' })).user;
      await request(app)
        .post('/api/store-credit')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: user.id, amount: 40, type: 'goodwill', accountCode: '5100', notes: 'shipping comp' });
      const accs = await chart();
      const shipping = accs.find((a: any) => a.code === '5100');
      const entries = await journalEntries(token);
      expect(entries).toHaveLength(1);
      expect(entries[0].lines.some((l: any) => l.accountId === shipping.id && l.debit === 40)).toBe(true);
    });
  });

  it('a creditToStoreCredit refund posts exactly ONE entry (issuance hook skips refunds)', async () => {
    await withAutoPost(async () => {
      const { token } = await authHeader({ role: 'admin' });
      const user = (await authHeader({ role: 'customer' })).user;
      const order = await createOrder(user.id, {
        paymentStatus: 'completed',
        subtotal: 90,
        taxAmount: 10,
        totalAmount: 100,
      });
      const refund = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, reason: 'return', creditToStoreCredit: true });
      expect(refund.status).toBe(200);

      // Regression: the refund flow calls creditStoreCredit(type 'refund')
      // AND autoPostRefund(toStoreCredit) — if both posted, the refund
      // would be double-counted in the ledger.
      const entries = await journalEntries(token);
      expect(entries).toHaveLength(1);
      expect(entries[0].memo).toContain('Refund');
    });
  });

  it('posts nothing when auto-posting is off', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const user = (await authHeader({ role: 'customer' })).user;
    await request(app)
      .post('/api/store-credit')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: user.id, amount: 50, type: 'goodwill' });
    const entries = await journalEntries(token);
    expect(entries).toHaveLength(0);
  });
});

describe('payments received on an AR-posted order', () => {
  it('auto-posts the cash-in transfer when a posted unpaid order is settled', async () => {
    process.env.ACCOUNTING_AUTO_POST = 'true';
    try {
      const { token } = await authHeader({ role: 'admin' });
      const user = (await authHeader({ role: 'customer' })).user;
      const order = await createOrder(user.id, {
        paymentStatus: 'pending',
        paymentMethod: 'bank_transfer',
        subtotal: 90,
        taxAmount: 10,
        totalAmount: 100,
      });

      // 1. Post the sale while unpaid -> accounts receivable.
      const post = await request(app)
        .post(`/api/accounting/orders/${order.id}/post`)
        .set('Authorization', `Bearer ${token}`);
      expect(post.status).toBe(200);

      // 2. The order is settled (bank transfer received).
      const settle = await request(app)
        .post('/api/payments/process')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, paymentMethod: 'bank_transfer' });
      expect(settle.status).toBe(200);

      // 3. A payment-received transfer entry cleared the AR.
      const accs = (await adminGet('/api/accounting/accounts')).body.data;
      const ar = accs.find((a: any) => a.code === '1300');
      const bank = accs.find((a: any) => a.code === '1100');
      const entries = (await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`)).body.data;
      const transfer = entries.find((e: any) => e.memo.includes('Payment received'));
      expect(transfer).toBeTruthy();
      expect(transfer.reference).toBe(order.id);
      expect(transfer.lines.some((l: any) => l.accountId === ar.id && l.credit === 100)).toBe(true);
      expect(transfer.lines.some((l: any) => l.accountId === bank.id && l.debit === 100)).toBe(true);

      // AR nets to zero; the sale + transfer balance.
      const balances = (await request(app).get('/api/accounting/reports/balances').set('Authorization', `Bearer ${token}`)).body.data;
      expect(balances.find((b: any) => b.account.id === ar.id).balance).toBe(0);
    } finally {
      delete process.env.ACCOUNTING_AUTO_POST;
    }
  });

  it('the manual post action posts the transfer instead of refusing (and only once)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const user = (await authHeader({ role: 'customer' })).user;
    const order = await createOrder(user.id, {
      paymentStatus: 'pending',
      paymentMethod: 'bank_transfer',
      subtotal: 90,
      taxAmount: 10,
      totalAmount: 100,
    });

    // Post while unpaid -> AR.
    const post = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(200);

    // Settle WITHOUT auto-posting (flag off)…
    const settle = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, paymentMethod: 'bank_transfer' });
    expect(settle.status).toBe(200);

    // …then Post from Order again: the AR gets cleared, not a 400.
    const transfer = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(transfer.status).toBe(200);
    expect(transfer.body.data.memo).toContain('Payment received');

    // A third post is refused (sale + transfer both live).
    const again = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('POST_ORDER_FAILED');
  });

  it('still refuses a double-post while the order stays unpaid (no transfer)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const user = (await authHeader({ role: 'customer' })).user;
    const order = await createOrder(user.id, {
      paymentStatus: 'pending',
      paymentMethod: 'cash_on_delivery',
      subtotal: 90,
      taxAmount: 10,
      totalAmount: 100,
    });
    const first = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/accounting/orders/${order.id}/post`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('POST_ORDER_FAILED');
  });
});

describe('CSV export', () => {
  it('exports the trial balance as CSV', async () => {
    await postSale(50);
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/accounting/export/trial-balance.csv').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('code,account,debit,credit');
    expect(res.text).toContain('1000');
  });
});

describe('corruption safety', () => {
  it('does not silently wipe a corrupt journal file', async () => {
    const { token } = await authHeader({ role: 'admin' });
    // Force a bad file to exist.
    fs.writeFileSync(path.join(tempDir, 'journal.json'), 'not valid json{{{{');

    const res = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(200);
    // The corrupt file is still on disk (nothing was overwritten/cleared).
    expect(fs.existsSync(path.join(tempDir, 'journal.json'))).toBe(true);
  });
});

describe('multi-currency', () => {
  async function postWithCurrency(currency: string, amount: number) {
    const { token } = await authHeader({ role: 'admin' });
    const accs = (await request(app).get('/api/accounting/accounts').set('Authorization', `Bearer ${token}`)).body.data;
    const cash = accs.find((a: any) => a.code === '1000');
    const sales = accs.find((a: any) => a.code === '4000');
    const res = await request(app)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2024-03-01', memo: `${currency} sale`, currency, lines: [
        { accountId: cash.id, debit: amount },
        { accountId: sales.id, credit: amount },
      ] });
    expect(res.status).toBe(200);
  }

  it('reports filter to a single currency', async () => {
    await postWithCurrency('USD', 100);
    await postWithCurrency('EUR', 50);
    const { token } = await authHeader({ role: 'admin' });
    const all = await request(app).get('/api/accounting/reports/income-statement').set('Authorization', `Bearer ${token}`);
    expect(all.body.data.totalRevenue).toBe(150);
    const eur = await request(app).get('/api/accounting/reports/income-statement?currency=EUR').set('Authorization', `Bearer ${token}`);
    expect(eur.body.data.totalRevenue).toBe(50);
  });

  it('rejects a malformed currency code', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const accs = (await request(app).get('/api/accounting/accounts').set('Authorization', `Bearer ${token}`)).body.data;
    const cash = accs.find((a: any) => a.code === '1000');
    const sales = accs.find((a: any) => a.code === '4000');
    const res = await request(app)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2024-03-01', memo: 'bad', currency: 'US DOLLAR', lines: [
        { accountId: cash.id, debit: 10 },
        { accountId: sales.id, credit: 10 },
      ] });
    expect(res.status).toBe(400);
  });
});

describe('voiding entries', () => {
  it('removes a voided entry from balances but keeps it in the journal', async () => {
    const posted = await postSale(100);
    const { token } = await authHeader({ role: 'admin' });
    const entryId = posted.body.data.id;

    const before = await request(app).get('/api/accounting/reports/balances').set('Authorization', `Bearer ${token}`);
    const accs = (await request(app).get('/api/accounting/accounts').set('Authorization', `Bearer ${token}`)).body.data;
    const cash = accs.find((a: any) => a.code === '1000');
    expect(before.body.data.find((b: any) => b.account.id === cash.id).balance).toBe(100);

    const voidRes = await request(app)
      .post(`/api/accounting/entries/${entryId}/void`)
      .set('Authorization', `Bearer ${token}`);
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.data.voided).toBe(true);

    const after = await request(app).get('/api/accounting/reports/balances').set('Authorization', `Bearer ${token}`);
    expect(after.body.data.find((b: any) => b.account.id === cash.id).balance).toBe(0);

    // Still in the journal for the audit trail.
    const list = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.some((e: any) => e.id === entryId && e.voided)).toBe(true);
  });
});

describe('fiscal-year closing', () => {
  it('transfers net income to retained earnings without zeroing the P&L', async () => {
    await postSale(200);
    const { token } = await authHeader({ role: 'admin' });

    const close = await request(app)
      .post('/api/accounting/entries/close-year/2024')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(close.status).toBe(200);
    expect(close.body.data.kind).toBe('closing');

    // Income statement still reports the closed year's revenue.
    const pnl = await request(app).get('/api/accounting/reports/income-statement?from=2024-01-01&to=2024-12-31').set('Authorization', `Bearer ${token}`);
    expect(pnl.body.data.totalRevenue).toBe(200);

    // Balance sheet stays balanced with the profit folded into equity.
    const bs = await request(app).get('/api/accounting/reports/balance-sheet').set('Authorization', `Bearer ${token}`);
    expect(bs.body.data.balanced).toBe(true);
    expect(bs.body.data.equity.total).toBe(200);

    // Double-closing the same year is refused.
    const again = await request(app)
      .post('/api/accounting/entries/close-year/2024')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('CLOSE_YEAR_FAILED');
  });

  it('closes contra (negative-balance) accounts too', async () => {
    // A year where refunds exceed sales on the revenue account leaves it
    // with a negative (debit) balance. Regression: the close-year logic
    // only zeroed POSITIVE balances, so the negative carried into next
    // year's P&L as if it were fresh activity.
    const { token } = await authHeader({ role: 'admin' });
    await postSale(100); // cash 100 / sales 100
    const accs = (await adminGet('/api/accounting/accounts')).body.data;
    const cash = await findAccount(accs, '1000');
    const sales = await findAccount(accs, '4000');
    // Refund-style entry: debit sales 150, credit cash 150.
    const refund = await request(app)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2024-06-30',
        memo: 'Big refund',
        lines: [
          { accountId: sales.id, debit: 150, credit: 0 },
          { accountId: cash.id, debit: 0, credit: 150 },
        ],
      });
    expect(refund.status).toBe(200);

    const before = await adminGet('/api/accounting/reports/balances');
    const salesBefore = before.body.data.find((b: any) => b.account.id === sales.id);
    expect(salesBefore.balance).toBe(-50);

    const close = await request(app)
      .post('/api/accounting/entries/close-year/2024')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(close.status).toBe(200);

    // The contra balance is zeroed by the closing entry, and the sheet
    // balances with the loss folded into retained earnings.
    const after = await adminGet('/api/accounting/reports/balances');
    const salesAfter = after.body.data.find((b: any) => b.account.id === sales.id);
    expect(salesAfter.balance).toBe(0);

    const bs = await adminGet('/api/accounting/reports/balance-sheet');
    expect(bs.body.data.balanced).toBe(true);
    expect(bs.body.data.equity.total).toBe(-50);
  });
});

describe('auto-posting at checkout', () => {
  it('posts a sale entry automatically when a payment is settled', async () => {
    process.env.ACCOUNTING_AUTO_POST = 'true';
    try {
      const { token, user } = await authHeader({ role: 'admin' });
      const order = await createOrder(user.id, { subtotal: 100, taxAmount: 10, totalAmount: 110, paymentStatus: 'pending' });
      const res = await request(app)
        .post('/api/payments/process')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, paymentMethod: 'bank_transfer' });
      expect(res.status).toBe(200);

      const entries = await request(app).get('/api/accounting/entries').set('Authorization', `Bearer ${token}`);
      const posted = entries.body.data.find((e: any) => e.reference === order.orderNumber);
      expect(posted).toBeTruthy();
      expect(posted.memo).toContain('Sale');
    } finally {
      delete process.env.ACCOUNTING_AUTO_POST;
    }
  });
});
