// ---------------------------------------------------------------------------
// Accounting module — shared types.
//
// A lightweight, file-based double-entry bookkeeping engine. Data is stored as
// two JSON documents on disk (mirroring the themeStudio "files" storage model),
// so it needs no database migration and runs identically in every environment:
//
//   accounting/
//     accounts.json   - the chart of accounts (Account[])
//     journal.json    - the general journal (JournalEntry[])
//
// The engine itself (accountingEngine.ts) is pure: it operates on in-memory
// arrays and knows nothing about the filesystem, so the balancing rules and
// report math are unit-testable in isolation. accounting.service.ts owns the
// file I/O and the routes are a thin, validated CRUD layer on top.
//
// Amounts are stored as plain numbers in the store's currency (the same
// convention the rest of the API uses). Every computation rounds to cents on
// output so floating-point drift never surfaces in a report.
// ---------------------------------------------------------------------------

/** The five classic account classes. `normalSide` is derived from this. */
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

/** Which side of an account carries increases (and therefore its balance). */
export type NormalSide = 'debit' | 'credit';

export interface Account {
  id: string;
  /** Stable, unique, human-readable chart code, e.g. "1000", "1100". */
  code: string;
  name: string;
  type: AccountType;
  /** 'debit' for asset/expense, 'credit' for liability/equity/revenue. */
  normalSide: NormalSide;
  /** Closed accounts can't receive new postings but stay in the ledger. */
  active: boolean;
}

export interface JournalLine {
  accountId: string;
  /** Exactly one of debit/credit is non-zero per line. */
  debit: number;
  credit: number;
}

/**
 * The kind of a journal entry. `normal` is the default bookkeeping entry;
 * `closing` marks the fiscal-year closing entry that transfers net income to
 * retained earnings (excluded from the income statement and trial balance so
 * historical P&L stays intact, but included in balances / the balance sheet).
 */
export type EntryKind = 'normal' | 'closing';

/** The store's default bookkeeping currency when none is specified. */
export const DEFAULT_CURRENCY = 'USD';

export interface JournalEntry {
  id: string;
  /** ISO date (YYYY-MM-DD). The business date, not the posted date. */
  date: string;
  memo: string;
  /** Optional external reference, e.g. an order or invoice number. */
  reference?: string;
  /** ISO-4217 currency code the whole entry is denominated in. */
  currency: string;
  /** One or more balanced lines. Sum(debits) === Sum(credits). */
  lines: JournalLine[];
  createdAt: string;
  /** Voided entries are excluded from balances/reports but kept for the audit. */
  voided: boolean;
  kind: EntryKind;
}

/** A journal entry as submitted by a client (before id/createdAt are set). */
export type NewJournalEntry = Omit<JournalEntry, 'id' | 'createdAt' | 'currency' | 'voided' | 'kind'> & {
  currency?: string;
  voided?: boolean;
  kind?: EntryKind;
};

// ---- Report shapes ---------------------------------------------------------

export interface AccountBalance {
  account: Account;
  /** Signed net balance in the account's normal side (positive = normal). */
  balance: number;
  /** Same value shown as raw debit/credit totals. */
  debits: number;
  credits: number;
}

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
}

export interface IncomeStatementRow {
  account: Account;
  amount: number;
}

export interface BalanceSheetSection {
  /** Total for the section. */
  total: number;
  rows: IncomeStatementRow[];
}

export interface BalanceSheetReport {
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  /** assets - (liabilities + equity); should be 0 when books are balanced. */
  balancingDifference: number;
  /** A one-line explanation shown on the admin report card. */
  balanced: boolean;
}

export interface IncomeStatementReport {
  revenue: IncomeStatementRow[];
  totalRevenue: number;
  expenses: IncomeStatementRow[];
  totalExpenses: number;
  /** Revenue - expenses. */
  netIncome: number;
}

export const ACCOUNT_TYPE_NORMAL_SIDE: Record<AccountType, NormalSide> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
};
