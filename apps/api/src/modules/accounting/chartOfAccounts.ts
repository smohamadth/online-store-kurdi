// ---------------------------------------------------------------------------
// Default chart of accounts.
//
// Written to accounts.json the first time the accounting module is used. It is
// deliberately small but complete: every class (asset/liability/equity/revenue/
// expense) is represented with the accounts a small online store needs. Codes
// follow the classic 1000-series grouping so admins can insert new accounts
// (e.g. 1050 Loan Payments) without colliding with the seed's ranges:
//
//   1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx revenue, 5xxx expenses.
//
// "System" accounts (cash, payment gateways, sales, the equity roll-up) are
// flagged below so the admin UI can keep them from being deleted.
// ---------------------------------------------------------------------------

import type { Account } from './types';

export const DEFAULT_CHART_OF_ACCOUNTS: Omit<Account, 'id'>[] = [
  // ---- Assets (1xxx) ------------------------------------------------------
  { code: '1000', name: 'Cash on hand', type: 'asset', normalSide: 'debit', active: true },
  { code: '1100', name: 'Bank — operating account', type: 'asset', normalSide: 'debit', active: true },
  { code: '1200', name: 'Payment gateway (Stripe etc.)', type: 'asset', normalSide: 'debit', active: true },
  { code: '1300', name: 'Accounts receivable', type: 'asset', normalSide: 'debit', active: true },
  { code: '1400', name: 'Inventory', type: 'asset', normalSide: 'debit', active: true },
  // ---- Liabilities (2xxx) -------------------------------------------------
  { code: '2000', name: 'Accounts payable', type: 'liability', normalSide: 'credit', active: true },
  { code: '2100', name: 'Sales tax payable', type: 'liability', normalSide: 'credit', active: true },
  { code: '2200', name: 'Customer deposits', type: 'liability', normalSide: 'credit', active: true },
  // ---- Equity (3xxx) ------------------------------------------------------
  { code: '3000', name: 'Owner investment', type: 'equity', normalSide: 'credit', active: true },
  { code: '3100', name: 'Retained earnings', type: 'equity', normalSide: 'credit', active: true },
  // ---- Revenue (4xxx) -----------------------------------------------------
  { code: '4000', name: 'Product sales', type: 'revenue', normalSide: 'credit', active: true },
  { code: '4100', name: 'Shipping revenue', type: 'revenue', normalSide: 'credit', active: true },
  { code: '4200', name: 'Refunds / returns', type: 'revenue', normalSide: 'credit', active: true },
  // ---- Expenses (5xxx) ----------------------------------------------------
  { code: '5000', name: 'Cost of goods sold', type: 'expense', normalSide: 'debit', active: true },
  { code: '5100', name: 'Shipping & fulfilment', type: 'expense', normalSide: 'debit', active: true },
  { code: '5200', name: 'Payment processing fees', type: 'expense', normalSide: 'debit', active: true },
  { code: '5300', name: 'Marketing & advertising', type: 'expense', normalSide: 'debit', active: true },
  { code: '5400', name: 'Software & subscriptions', type: 'expense', normalSide: 'debit', active: true },
  { code: '5500', name: 'Rent & utilities', type: 'expense', normalSide: 'debit', active: true },
  { code: '5600', name: 'Salaries & wages', type: 'expense', normalSide: 'debit', active: true },
  { code: '5700', name: 'Office & supplies', type: 'expense', normalSide: 'debit', active: true },
  { code: '5800', name: 'Other expenses', type: 'expense', normalSide: 'debit', active: true },
];

/**
 * System-protected account codes. These seed accounts carry the core cash /
 * sales / equity positions; deleting them would leave the chart without its
 * anchor accounts, so the API refuses and the admin UI grays them out.
 */
export const SYSTEM_ACCOUNT_CODES: string[] = ['1000', '1100', '1200', '4000', '3000', '3100'];
