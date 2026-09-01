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
