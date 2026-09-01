// ---------------------------------------------------------------------------
// Pure double-entry engine.
//
// Every function here is a pure transformation over (accounts[], entries[]).
// No filesystem, no timestamps beyond what the caller supplies — that makes the
// balancing rules and the report math trivially unit-testable. The service
// layer loads the two JSON docs and calls these, then persists the result.
//
// Core invariant enforced everywhere: for every journal entry,
//   sum(debits) === sum(credits)  (to the cent).
// A report is only "balanced" when that holds across every posted entry.
// ---------------------------------------------------------------------------

import { ACCOUNT_TYPE_NORMAL_SIDE, DEFAULT_CURRENCY } from './types';
import type {
  Account,
  AccountBalance,
  BalanceSheetReport,
  IncomeStatementReport,
  IncomeStatementRow,
  EntryKind,
  JournalEntry,
  JournalLine,
  NewJournalEntry,
  TrialBalanceRow,
} from './types';

const CENTS = 100;

/** Round to the nearest cent (2 decimals) to kill floating-point drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * CENTS) / CENTS;
}

/**
 * Normalise a journal entry read from disk (or built by a caller) by filling
 * defaults for fields that may be absent in older files. This keeps the ledger
 * backward compatible with pre-currency/voided/kind data.
 */
export function normalizeEntry(e: JournalEntry): JournalEntry {
  return {
    ...e,
    currency: e.currency || DEFAULT_CURRENCY,
    voided: e.voided ?? false,
    kind: e.kind ?? 'normal',
  };
}

/** Only entries that actually count toward balances (voided ones are dropped). */
export function postedEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.filter((e) => !e.voided);
}

/**
 * Filter entries to a currency (ISO code). With no currency, all entries pass.
 */
export function filterByCurrency(entries: JournalEntry[], currency?: string): JournalEntry[] {
  if (!currency) return entries;
  const c = currency.toUpperCase();
  return entries.filter((e) => e.currency.toUpperCase() === c);
}

/**
 * Validate a new journal entry against the current chart of accounts.
 * Returns a normalized copy with amounts rounded to cents. Throws an Error
 * with a human-readable message on any violation.
 */
export function validateJournalEntry(
  accounts: Account[],
  entry: NewJournalEntry
): { date: string; memo: string; reference?: string; currency: string; lines: JournalLine[]; kind: EntryKind; voided: boolean } {
  if (!entry || typeof entry !== 'object') throw new Error('Journal entry is required');

  if (entry.currency !== undefined) {
    if (typeof entry.currency !== 'string' || !/^[A-Za-z]{3}$/.test(entry.currency)) {
      throw new Error('Currency must be a 3-letter ISO-4217 code (e.g. USD)');
    }
  }
  if (entry.kind !== undefined && entry.kind !== 'normal' && entry.kind !== 'closing') {
    throw new Error('Entry kind must be "normal" or "closing"');
  }

  if (typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    throw new Error('Entry date must be an ISO date (YYYY-MM-DD)');
  }
  // Reject impossible dates (e.g. 2024-13-45) via the Date round-trip.
  const d = new Date(`${entry.date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error('Entry date is invalid');

  if (typeof entry.memo !== 'string' || !entry.memo.trim()) {
    throw new Error('A memo describing the entry is required');
  }
  if (entry.memo.length > 240) throw new Error('Memo must be 240 characters or fewer');
  if (entry.reference !== undefined && entry.reference !== null) {
    if (typeof entry.reference !== 'string') throw new Error('Reference must be a string');
    if (entry.reference.length > 120) throw new Error('Reference must be 120 characters or fewer');
  }

  const rawLines = Array.isArray(entry.lines) ? entry.lines : [];
  if (rawLines.length < 2) {
    throw new Error('A journal entry needs at least two lines (one debit, one credit)');
  }

  const byAccount = new Map<string, Account>(accounts.map((a) => [a.id, a]));
  const lines: JournalLine[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let hasDebit = false;
  let hasCredit = false;

  for (const line of rawLines) {
    if (!line || typeof line !== 'object') throw new Error('Each line must be an object');
    const { accountId, debit, credit } = line as { accountId?: unknown; debit?: unknown; credit?: unknown };

    const account = typeof accountId === 'string' ? byAccount.get(accountId) : undefined;
    if (!account) throw new Error(`Line references an unknown account id "${String(accountId)}"`);
    if (!account.active) throw new Error(`Account "${account.name}" (${account.code}) is closed and cannot be posted to`);

    const debitN = Number(debit) || 0;
    const creditN = Number(credit) || 0;

    if (!Number.isFinite(debitN) || !Number.isFinite(creditN)) {
      throw new Error(`Line on "${account.name}" has a non-finite amount`);
    }
    if (debitN < 0 || creditN < 0) {
      throw new Error(`Line on "${account.name}" has a negative amount`);
    }
    // Exactly one side must be populated.
    const bothZero = debitN === 0 && creditN === 0;
    const bothNonZero = debitN !== 0 && creditN !== 0;
    if (bothZero || bothNonZero) {
      throw new Error(`Line on "${account.name}" must set exactly one of debit or credit`);
    }

    const debitR = round2(debitN);
    const creditR = round2(creditN);
    totalDebit += debitR;
    totalCredit += creditR;
    if (debitR > 0) hasDebit = true;
    if (creditR > 0) hasCredit = true;
    lines.push({ accountId: account.id, debit: debitR, credit: creditR });
  }

  if (!hasDebit || !hasCredit) throw new Error('A journal entry needs at least one debit and one credit line');
  if (round2(totalDebit) !== round2(totalCredit)) {
    throw new Error(`Entry does not balance: debits ${round2(totalDebit)} ≠ credits ${round2(totalCredit)}`);
  }

  return {
    date: entry.date,
    memo: entry.memo.trim(),
    ...(entry.reference ? { reference: entry.reference.trim() } : {}),
    currency: (entry.currency || DEFAULT_CURRENCY).toUpperCase(),
    kind: entry.kind ?? 'normal',
    voided: entry.voided ?? false,
    lines,
  };
}

/**
 * Net balance of a single account given every posted line.
 * Positive = a normal-side balance (debit for assets/expenses, credit for the
 * rest); negative = a contra balance.
 */
export function accountBalance(account: Account, entries: JournalEntry[]): number {
  let net = 0;
  for (const e of entries) {
    if (e.voided) continue;
    for (const line of e.lines) {
      if (line.accountId !== account.id) continue;
      net += line.debit - line.credit;
    }
  }
  const normalSide = ACCOUNT_TYPE_NORMAL_SIDE[account.type];
  return normalSide === 'debit' ? net : -net;
}

/** Debit/credit totals for a single account (raw, unsigned). */
export function accountDebitCreditTotals(account: Account, entries: JournalEntry[]): { debits: number; credits: number } {
  let debits = 0;
  let credits = 0;
  for (const e of entries) {
    if (e.voided) continue;
    for (const line of e.lines) {
      if (line.accountId !== account.id) continue;
      debits += line.debit;
      credits += line.credit;
    }
  }
  return { debits: round2(debits), credits: round2(credits) };
}

/** Every account with its signed balance and raw debit/credit totals. */
export function computeAccountBalances(accounts: Account[], entries: JournalEntry[]): AccountBalance[] {
  return accounts.map((account) => {
    const { debits, credits } = accountDebitCreditTotals(account, entries);
    return {
      account,
      balance: round2(accountBalance(account, entries)),
      debits,
      credits,
    };
  });
}

/**
 * Trial balance: for each account, its total debits and credits. When the
 * books are balanced the grand totals are equal.
 */
export function trialBalance(accounts: Account[], entries: JournalEntry[]): TrialBalanceRow[] {
  return accounts.map((account) => {
    const { debits, credits } = accountDebitCreditTotals(account, entries);
    return { account, debit: debits, credit: credits };
  });
}

function normalizeIncomeRow(account: Account, amount: number): IncomeStatementRow {
  // Revenue accounts carry a normal credit balance; expenses a normal debit.
  // A positive credit balance on a revenue account is income; a negative one
  // (a refund over-riding sales) is shown as a negative amount.
  return { account, amount: round2(amount) };
}

/** Income statement: revenue − expenses = net income for the period. */
export function incomeStatement(accounts: Account[], entries: JournalEntry[]): IncomeStatementReport {
  const revenueAccounts = accounts.filter((a) => a.type === 'revenue');
  const expenseAccounts = accounts.filter((a) => a.type === 'expense');

  const revenue = revenueAccounts
    .map((a) => normalizeIncomeRow(a, accountBalance(a, entries)))
    .filter((r) => r.amount !== 0);
  const expenses = expenseAccounts
    .map((a) => normalizeIncomeRow(a, accountBalance(a, entries)))
    .filter((r) => r.amount !== 0);

  const totalRevenue = round2(revenue.reduce((s, r) => s + r.amount, 0));
  const totalExpenses = round2(expenses.reduce((s, r) => s + r.amount, 0));

  return { revenue, expenses, totalRevenue, totalExpenses, netIncome: round2(totalRevenue - totalExpenses) };
}

/**
 * Balance sheet: assets = liabilities + equity. Equity includes retained
 * earnings PLUS the current period's net income (a plain storefront is assumed
 * to pay dividends/withdrawals into Retained earnings rather than a separate
 * "Drawings" account).
 */
export function balanceSheet(accounts: Account[], entries: JournalEntry[]): BalanceSheetReport {
  const pnl = incomeStatement(accounts, entries);

  const sections = (type: 'asset' | 'liability' | 'equity'): { total: number; rows: IncomeStatementRow[] } => {
    const rows = accounts
      .filter((a) => a.type === type)
      .map((a) => normalizeIncomeRow(a, accountBalance(a, entries)))
      .filter((r) => r.amount !== 0);
    return { total: round2(rows.reduce((s, r) => s + r.amount, 0)), rows };
  };

  const assets = sections('asset');
  const liabilities = sections('liability');
  const equityRaw = sections('equity');

  // Retained earnings on the sheet should reflect the cumulative profit, so
  // fold the current net income into the equity total.
  const equity = {
    ...equityRaw,
    rows: equityRaw.rows.map((r) =>
      r.account.type === 'equity' && r.account.code === '3100' ? { ...r, amount: round2(r.amount + pnl.netIncome) } : r
    ),
    total: round2(equityRaw.total + pnl.netIncome),
  };

  const balancingDifference = round2(assets.total - liabilities.total - equity.total);
  return {
    assets,
    liabilities,
    equity,
    balancingDifference,
    balanced: balancingDifference === 0,
  };
}

/** All journal entries that touch a given account (for the GL page). */
export function ledgerForAccount(accountId: string, entries: JournalEntry[]): JournalEntry[] {
  return entries
    .filter((e) => !e.voided && e.lines.some((l) => l.accountId === accountId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Filter entries to an inclusive [from, to] date range. With no range, or with
 * a range that has both bounds empty, every entry is returned. ISO date strings
 * compare correctly with plain string `<`/`>`.
 */
export function filterEntriesByDate(
  entries: JournalEntry[],
  range?: { from?: string; to?: string }
): JournalEntry[] {
  if (!range) return entries;
  const { from, to } = range;
  if (!from && !to) return entries;
  return entries.filter((e) => {
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    return true;
  });
}

/** Validate an optional date range. Returns normalized bounds (or undefined). */
export function validateDateRange(range?: { from?: string; to?: string }): { from?: string; to?: string } {
  if (!range) return {};
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const clean = { from: range.from, to: range.to };
  for (const key of ['from', 'to'] as const) {
    const v = clean[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || !dateRe.test(v)) {
      throw new Error(`Invalid ${key} date — use YYYY-MM-DD`);
    }
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${key} date`);
  }
  if (clean.from && clean.to && clean.from > clean.to) {
    throw new Error('"from" date cannot be after "to" date');
  }
  return clean;
}

/** A single general-ledger row: one line plus the running balance after it. */
export interface LedgerRow {
  entry: JournalEntry;
  line: JournalLine;
  /** The account's running normal-side balance after this line. */
  runningBalance: number;
}

/**
 * General ledger with a running balance, in posting order. The running balance
 * is expressed in the account's normal side (positive = normal balance).
 */
export function ledgerWithRunningBalance(account: Account, entries: JournalEntry[]): LedgerRow[] {
  const sorted = entries
    .filter((e) => !e.voided && e.lines.some((l) => l.accountId === account.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const normalSide = account.normalSide;
  let running = 0;
  const rows: LedgerRow[] = [];
  for (const entry of sorted) {
    for (const line of entry.lines) {
      if (line.accountId !== account.id) continue;
      running += line.debit - line.credit;
      const signed = normalSide === 'debit' ? running : -running;
      rows.push({ entry, line, runningBalance: round2(signed) });
    }
  }
  return rows;
}

/**
 * Build a reversing (offsetting) entry for a posted entry: every debit becomes
 * a credit and vice-versa, keeping the original date and memo (prefixed so the
 * audit trail is self-documenting). Returns a NewJournalEntry ready to post.
 */
export function reverseEntry(entry: JournalEntry): NewJournalEntry {
  const lines: JournalLine[] = entry.lines.map((l) => ({
    accountId: l.accountId,
    debit: l.credit,
    credit: l.debit,
  }));
  return {
    date: entry.date,
    memo: `REVERSE — ${entry.memo}`,
    ...(entry.reference ? { reference: entry.reference } : {}),
    currency: entry.currency,
    kind: 'normal',
    lines,
  };
}

/** True when an account has ever been posted to (blocks deletion). */
export function accountHasPostings(accountId: string, entries: JournalEntry[]): boolean {
  return entries.some((e) => !e.voided && e.lines.some((l) => l.accountId === accountId));
}
