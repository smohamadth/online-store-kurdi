// ---------------------------------------------------------------------------
// Unit tests for the pure double-entry engine.
//
// These exercise the balancing invariant, the report math and the account
// normal-side conventions without any filesystem or database involvement.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import type { Account, JournalEntry } from '../../../src/modules/accounting/types';
import {
  round2,
  validateJournalEntry,
  accountBalance,
  computeAccountBalances,
  trialBalance,
  incomeStatement,
  balanceSheet,
  ledgerForAccount,
  ledgerWithRunningBalance,
  filterEntriesByDate,
  validateDateRange,
  reverseEntry,
  accountHasPostings,
} from '../../../src/modules/accounting/accountingEngine';

const acc = (id: string, code: string, name: string, type: Account['type']): Account => ({
  id,
  code,
  name,
  type,
  normalSide: type === 'asset' || type === 'expense' ? 'debit' : 'credit',
  active: true,
});

const accounts: Account[] = [
  acc('a-cash', '1000', 'Cash', 'asset'),
  acc('a-ar', '1300', 'Accounts receivable', 'asset'),
  acc('a-sales', '4000', 'Sales', 'revenue'),
  acc('a-cogs', '5000', 'COGS', 'expense'),
  acc('a-re', '3100', 'Retained earnings', 'equity'),
];

const entry = (id: string, lines: JournalEntry['lines'], date = '2024-01-15'): JournalEntry => ({
  id,
  date,
  memo: `entry ${id}`,
  lines,
  createdAt: `2024-01-15T10:00:00.000Z`,
});

describe('round2', () => {
  it('rounds to cents', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1)).toBe(1);
  });
});

describe('validateJournalEntry', () => {
  const base = (lines: any[]) => ({ date: '2024-01-15', memo: 'test', lines });

  it('accepts a balanced two-line entry and rounds amounts', () => {
    const out = validateJournalEntry(accounts, base([
      { accountId: 'a-cash', debit: 100.005 },
      { accountId: 'a-sales', credit: 100.005 },
    ]));
    expect(out.lines[0].debit).toBe(100.01);
    expect(out.lines[1].credit).toBe(100.01);
  });

  it('rejects an unbalanced entry', () => {
    expect(() => validateJournalEntry(accounts, base([
      { accountId: 'a-cash', debit: 100 },
      { accountId: 'a-sales', credit: 99.99 },
    ]))).toThrow(/does not balance/);
  });

  it('rejects fewer than two lines', () => {
    expect(() => validateJournalEntry(accounts, base([{ accountId: 'a-cash', debit: 5 }])))
      .toThrow(/at least two lines/);
  });

  it('rejects a line with both debit and credit set', () => {
    expect(() => validateJournalEntry(accounts, base([
      { accountId: 'a-cash', debit: 5, credit: 5 },
      { accountId: 'a-sales', credit: 5 },
    ]))).toThrow(/exactly one of debit or credit/);
  });

  it('rejects a line with both zero', () => {
    expect(() => validateJournalEntry(accounts, base([
      { accountId: 'a-cash', debit: 0 },
      { accountId: 'a-sales', credit: 0 },
    ]))).toThrow(/exactly one of debit or credit/);
  });

  it('rejects a negative amount', () => {
    expect(() => validateJournalEntry(accounts, base([
      { accountId: 'a-cash', debit: -5 },
      { accountId: 'a-sales', credit: -5 },
    ]))).toThrow(/negative/);
  });

  it('rejects an unknown account', () => {
    expect(() => validateJournalEntry(accounts, base([
      { accountId: 'nope', debit: 5 },
      { accountId: 'a-sales', credit: 5 },
    ]))).toThrow(/unknown account/);
  });

  it('rejects posting to a closed account', () => {
    const closed = accounts.map((a) => (a.id === 'a-cash' ? { ...a, active: false } : a));
    expect(() => validateJournalEntry(closed, base([
      { accountId: 'a-cash', debit: 5 },
      { accountId: 'a-sales', credit: 5 },
    ]))).toThrow(/closed/);
  });

  it('rejects an invalid date and a missing memo', () => {
    expect(() => validateJournalEntry(accounts, { date: '2024-13-99', memo: 'x', lines: [
      { accountId: 'a-cash', debit: 5 },
      { accountId: 'a-sales', credit: 5 },
    ] })).toThrow(/date/);
    expect(() => validateJournalEntry(accounts, { date: '2024-01-15', memo: '   ', lines: [
      { accountId: 'a-cash', debit: 5 },
      { accountId: 'a-sales', credit: 5 },
    ] })).toThrow(/memo/);
  });

  it('accepts an optional reference', () => {
    const out = validateJournalEntry(accounts, { date: '2024-01-15', memo: 'x', reference: 'ORD-123', lines: [
      { accountId: 'a-cash', debit: 5 },
      { accountId: 'a-sales', credit: 5 },
    ] });
    expect(out.reference).toBe('ORD-123');
  });
});

describe('accountBalance', () => {
  const entries = [
    entry('e1', [{ accountId: 'a-cash', debit: 100, credit: 0 }, { accountId: 'a-sales', credit: 100, debit: 0 }]),
    entry('e2', [{ accountId: 'a-cash', debit: 50, credit: 0 }, { accountId: 'a-cogs', debit: 30, credit: 0 }, { accountId: 'a-re', credit: 80, debit: 0 }]),
  ];

  it('keeps asset/expense balances on the debit side', () => {
    expect(accountBalance(accounts.find((a) => a.id === 'a-cash')!, entries)).toBe(150);
    expect(accountBalance(accounts.find((a) => a.id === 'a-cogs')!, entries)).toBe(30);
  });

  it('keeps revenue/equity balances on the credit side', () => {
    expect(accountBalance(accounts.find((a) => a.id === 'a-sales')!, entries)).toBe(100);
    expect(accountBalance(accounts.find((a) => a.id === 'a-re')!, entries)).toBe(80);
  });

  it('returns zero for an untouched account', () => {
    expect(accountBalance(accounts.find((a) => a.id === 'a-ar')!, entries)).toBe(0);
  });
});

describe('computeAccountBalances / trialBalance', () => {
  const entries = [
    entry('e1', [{ accountId: 'a-cash', debit: 100, credit: 0 }, { accountId: 'a-sales', credit: 100, debit: 0 }]),
  ];

  it('reports raw debit/credit totals per account', () => {
    const balances = computeAccountBalances(accounts, entries);
    const cash = balances.find((b) => b.account.id === 'a-cash')!;
    expect(cash.debits).toBe(100);
    expect(cash.credits).toBe(0);
    expect(cash.balance).toBe(100);
  });

  it('trial balance grand totals are equal', () => {
    const tb = trialBalance(accounts, entries);
    const d = tb.reduce((s, r) => s + r.debit, 0);
    const c = tb.reduce((s, r) => s + r.credit, 0);
    expect(d).toBe(c);
  });
});

describe('incomeStatement', () => {
  const entries = [
    entry('e1', [{ accountId: 'a-cash', debit: 500, credit: 0 }, { accountId: 'a-sales', credit: 500, debit: 0 }]),
    entry('e2', [{ accountId: 'a-cogs', debit: 200, credit: 0 }, { accountId: 'a-cash', credit: 200, debit: 0 }]),
  ];

  it('computes net income = revenue - expenses', () => {
    const pnl = incomeStatement(accounts, entries);
    expect(pnl.totalRevenue).toBe(500);
    expect(pnl.totalExpenses).toBe(200);
    expect(pnl.netIncome).toBe(300);
  });
});

describe('balanceSheet', () => {
  const entries = [
    // Owner invests 1000 cash into the business.
    entry('e1', [
      { accountId: 'a-cash', debit: 1000, credit: 0 },
      { accountId: 'a-re', credit: 1000, debit: 0 },
    ]),
    // Sell 500 of goods that cost 200 (net income 300, cash up by 300 net).
    entry('e2', [
      { accountId: 'a-cash', debit: 500, credit: 0 },
      { accountId: 'a-sales', credit: 500, debit: 0 },
    ]),
    entry('e3', [
      { accountId: 'a-cogs', debit: 200, credit: 0 },
      { accountId: 'a-cash', credit: 200, debit: 0 },
    ]),
  ];

  it('assets = liabilities + equity (balanced)', () => {
    const bs = balanceSheet(accounts, entries);
    expect(bs.balanced).toBe(true);
    expect(bs.assets.total).toBe(bs.liabilities.total + bs.equity.total);
    // Cash 1000 + 500 - 200 = 1300.
    expect(bs.assets.total).toBe(1300);
    // Retained earnings 1000 + net income 300 = 1300.
    expect(bs.equity.total).toBe(1300);
  });
});

describe('ledgerForAccount / accountHasPostings', () => {
  const entries = [
    entry('e1', [{ accountId: 'a-cash', debit: 100, credit: 0 }, { accountId: 'a-sales', credit: 100, debit: 0 }], '2024-01-01'),
    entry('e2', [{ accountId: 'a-ar', debit: 40, credit: 0 }, { accountId: 'a-sales', credit: 40, debit: 0 }], '2024-01-02'),
  ];

  it('returns only entries touching the account, in date order', () => {
    const gl = ledgerForAccount('a-cash', entries);
    expect(gl.map((e) => e.id)).toEqual(['e1']);
  });

  it('flags whether an account has been posted to', () => {
    expect(accountHasPostings('a-cash', entries)).toBe(true);
    expect(accountHasPostings('a-cogs', entries)).toBe(false);
  });
});

describe('filterEntriesByDate / validateDateRange', () => {
  const entries = [
    entry('e1', [{ accountId: 'a-cash', debit: 1, credit: 0 }, { accountId: 'a-sales', credit: 1, debit: 0 }], '2024-01-10'),
    entry('e2', [{ accountId: 'a-cash', debit: 2, credit: 0 }, { accountId: 'a-sales', credit: 2, debit: 0 }], '2024-01-31'),
    entry('e3', [{ accountId: 'a-cash', debit: 3, credit: 0 }, { accountId: 'a-sales', credit: 3, debit: 0 }], '2024-02-15'),
  ];

  it('returns everything with no range', () => {
    expect(filterEntriesByDate(entries)).toHaveLength(3);
    expect(filterEntriesByDate(entries, {})).toHaveLength(3);
  });

  it('filters to an inclusive [from,to] window', () => {
    const got = filterEntriesByDate(entries, { from: '2024-01-15', to: '2024-02-01' });
    expect(got.map((e) => e.id)).toEqual(['e2']);
  });

  it('validates the range bounds', () => {
    expect(() => validateDateRange({ from: 'not-a-date' })).toThrow(/YYYY-MM-DD/);
    expect(() => validateDateRange({ from: '2024-03-01', to: '2024-01-01' })).toThrow(/after/);
    expect(validateDateRange({ from: '2024-01-01', to: '2024-01-31' })).toEqual({ from: '2024-01-01', to: '2024-01-31' });
  });
});

describe('ledgerWithRunningBalance', () => {
  const cash = accounts.find((a) => a.id === 'a-cash')!;
  const entries = [
    entry('e1', [{ accountId: 'a-cash', debit: 100, credit: 0 }, { accountId: 'a-sales', credit: 100, debit: 0 }], '2024-01-01'),
    entry('e2', [{ accountId: 'a-cash', debit: 30, credit: 0 }, { accountId: 'a-sales', credit: 30, debit: 0 }], '2024-01-03'),
  ];

  it('accumulates a running balance on the normal side', () => {
    const rows = ledgerWithRunningBalance(cash, entries);
    expect(rows.map((r) => r.runningBalance)).toEqual([100, 130]);
  });

  it('runs in date order regardless of insertion order', () => {
    const shuffled = [entries[1], entries[0]];
    expect(ledgerWithRunningBalance(cash, shuffled).map((r) => r.runningBalance)).toEqual([100, 130]);
  });
});

describe('reverseEntry', () => {
  it('swaps every debit/credit so the entry still balances', () => {
    const e = entry('e1', [
      { accountId: 'a-cash', debit: 100, credit: 0 },
      { accountId: 'a-sales', credit: 100, debit: 0 },
    ]);
    const reversed = reverseEntry(e);
    expect(reversed.memo).toMatch(/REVERSE/);
    expect(reversed.lines[0]).toEqual({ accountId: 'a-cash', debit: 0, credit: 100 });
    expect(reversed.lines[1]).toEqual({ accountId: 'a-sales', debit: 100, credit: 0 });
    // The reversed entry itself is valid.
    expect(() => validateJournalEntry(accounts, reversed)).not.toThrow();
  });

  it('caps the memo at 240 chars so a max-length memo can still be reversed', () => {
    const long = entry('e1', [
      { accountId: 'a-cash', debit: 100, credit: 0 },
      { accountId: 'a-sales', credit: 100, debit: 0 },
    ]);
    long.memo = 'x'.repeat(240);
    const reversed = reverseEntry(long);
    expect(reversed.memo.length).toBeLessThanOrEqual(240);
    // And it still passes validation (the memo cap is enforced there).
    expect(() => validateJournalEntry(accounts, reversed)).not.toThrow();
  });
});
