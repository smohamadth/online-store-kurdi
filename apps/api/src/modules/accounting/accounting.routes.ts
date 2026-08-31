// ---------------------------------------------------------------------------
// Accounting routes (mounted at /api/accounting). Admin/manager only.
//
//   GET    /api/accounting/accounts           list chart of accounts
//   POST   /api/accounting/accounts           create an account
//   PUT    /api/accounting/accounts/:id       rename / open-close an account
//   DELETE /api/accounting/accounts/:id       delete (only if never posted)
//   GET    /api/accounting/entries            list journal entries
//   GET    /api/accounting/entries/:id        read one entry
//   POST   /api/accounting/entries            post a balanced journal entry
//   GET    /api/accounting/ledger/:accountId  general ledger for one account
//   GET    /api/accounting/reports/balances   every account's net balance
//   GET    /api/accounting/reports/trial-balance
//   GET    /api/accounting/reports/income-statement
//   GET    /api/accounting/reports/balance-sheet
//
// Storage is file-based (see accounting.service.ts), so no DB migration is
// involved. The engine enforces the double-entry invariant: an entry that does
// not balance (sum debits === sum credits) is refused with 400.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { serializeCsv } from '../../utils/csv';
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  listEntries,
  getEntry,
  postEntry,
  reversePostedEntry,
  voidEntry,
  closeFiscalYear,
  suggestOrderEntry,
  postOrderEntry,
  getLedger,
  getAccountBalances,
  getTrialBalance,
  getIncomeStatement,
  getBalanceSheet,
} from './accounting.service';

const router = Router();

/** Parse an optional inclusive [from,to] date range from query params. */
function dateRange(req: any): { from?: string; to?: string } | undefined {
  const from = req.query?.from;
  const to = req.query?.to;
  if (!from && !to) return undefined;
  return { from: from || undefined, to: to || undefined };
}

/** Parse the optional date range + currency into a ReportScope. */
function scopeOf(req: any): { range?: { from?: string; to?: string }; currency?: string } {
  const range = dateRange(req);
  const currency = (req.query?.currency as string | undefined) || undefined;
  return { range, currency };
}

// ---- Chart of accounts -----------------------------------------------------

router.get('/accounts', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    res.json({ status: 'success', data: await listAccounts() });
  } catch (err) {
    next(err);
  }
});

router.post('/accounts', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const account = await createAccount({
      code: req.body?.code,
      name: req.body?.name,
      type: req.body?.type,
    });
    logger.info(`Account ${account.code} (${account.name}) created`);
    res.json({ status: 'success', data: account });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not create account', code: 'INVALID_ACCOUNT' });
  }
});

router.put('/accounts/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const account = await updateAccount(req.params.id, {
      name: req.body?.name,
      active: req.body?.active,
    });
    res.json({ status: 'success', data: account });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not update account', code: 'UPDATE_ACCOUNT_FAILED' });
  }
});

router.delete('/accounts/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    await deleteAccount(req.params.id);
    res.json({ status: 'success', message: 'Account deleted.' });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not delete account', code: 'DELETE_ACCOUNT_FAILED' });
  }
});

// ---- Journal ---------------------------------------------------------------

router.get('/entries', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    res.json({ status: 'success', data: await listEntries() });
  } catch (err) {
    next(err);
  }
});

router.get('/entries/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const entry = await getEntry(req.params.id);
    if (!entry) return res.status(404).json({ status: 'error', message: 'Entry not found', code: 'NOT_FOUND' });
    res.json({ status: 'success', data: entry });
  } catch (err) {
    next(err);
  }
});

router.post('/entries', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const entry = await postEntry({
      date: req.body?.date,
      memo: req.body?.memo,
      reference: req.body?.reference,
      currency: req.body?.currency,
      lines: req.body?.lines,
    });
    logger.info(`Journal entry ${entry.id} posted (${entry.memo})`);
    res.json({ status: 'success', data: entry });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not post entry', code: 'INVALID_ENTRY' });
  }
});

// Post a reversing (offsetting) entry for an existing one — the audit-safe
// way to correct a mistake in an append-only journal.
router.post('/entries/:id/reverse', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const reversed = await reversePostedEntry(req.params.id);
    logger.info(`Journal entry ${req.params.id} reversed -> ${reversed.id}`);
    res.json({ status: 'success', data: reversed });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not reverse entry', code: 'REVERSE_FAILED' });
  }
});

// Void an entry: it stops counting toward balances/reports but stays in the
// journal for the audit trail (nothing is deleted).
router.post('/entries/:id/void', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const voided = await voidEntry(req.params.id);
    logger.info(`Journal entry ${req.params.id} voided`);
    res.json({ status: 'success', data: voided });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not void entry', code: 'VOID_FAILED' });
  }
});

// Close a fiscal year: transfer net income to retained earnings (per currency).
router.post('/entries/close-year/:year', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const currency = (req.body?.currency as string | undefined) || undefined;
    const entry = await closeFiscalYear(parseInt(req.params.year, 10), currency);
    logger.info(`Closed fiscal year ${req.params.year}`);
    res.json({ status: 'success', data: entry });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not close fiscal year', code: 'CLOSE_YEAR_FAILED' });
  }
});

// ---- Order → journal -------------------------------------------------------

// A proposed sale entry for an order, for admin review (no write).
router.get('/orders/:orderId/suggest', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await suggestOrderEntry(req.params.orderId) });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not suggest entry', code: 'SUGGEST_FAILED' });
  }
});

// Post the sale entry for an order (guards against double-posting).
router.post('/orders/:orderId/post', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const entry = await postOrderEntry(req.params.orderId);
    logger.info(`Order ${req.params.orderId} posted to ledger -> ${entry.id}`);
    res.json({ status: 'success', data: entry });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not post order entry', code: 'POST_ORDER_FAILED' });
  }
});

// ---- Ledger & reports ------------------------------------------------------

router.get('/ledger/:accountId', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const ledger = await getLedger(req.params.accountId, scopeOf(req));
    if (!ledger) return res.status(404).json({ status: 'error', message: 'Account not found', code: 'NOT_FOUND' });
    res.json({ status: 'success', data: ledger });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid date range', code: 'INVALID_RANGE' });
  }
});

router.get('/reports/balances', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await getAccountBalances(scopeOf(req)) });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid date range', code: 'INVALID_RANGE' });
  }
});

router.get('/reports/trial-balance', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await getTrialBalance(scopeOf(req)) });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid date range', code: 'INVALID_RANGE' });
  }
});

router.get('/reports/income-statement', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await getIncomeStatement(scopeOf(req)) });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid date range', code: 'INVALID_RANGE' });
  }
});

router.get('/reports/balance-sheet', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await getBalanceSheet(scopeOf(req)) });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid date range', code: 'INVALID_RANGE' });
  }
});

// ---- CSV export ------------------------------------------------------------

function sendCsv(res: any, filename: string, rows: (string | number | null)[][]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(serializeCsv(rows));
}

router.get('/export/trial-balance.csv', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const rows = (await getTrialBalance(scopeOf(req))).map((r) => [r.account.code, r.account.name, r.debit, r.credit]);
    sendCsv(res, `trial-balance${req.query.to ? `-${req.query.to}` : ''}.csv`, [['code', 'account', 'debit', 'credit'], ...rows]);
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid date range', code: 'INVALID_RANGE' });
  }
});

router.get('/export/income-statement.csv', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const pnl = await getIncomeStatement(scopeOf(req));
    const rows: (string | number)[][] = [
      ['section', 'account', 'amount'],
      ...pnl.revenue.map((r) => ['Revenue', `${r.account.code} ${r.account.name}`, r.amount]),
      ['Total Revenue', '', pnl.totalRevenue],
      ...pnl.expenses.map((r) => ['Expense', `${r.account.code} ${r.account.name}`, r.amount]),
      ['Total Expenses', '', pnl.totalExpenses],
      ['Net Income', '', pnl.netIncome],
    ];
    sendCsv(res, `income-statement${req.query.to ? `-${req.query.to}` : ''}.csv`, rows);
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid date range', code: 'INVALID_RANGE' });
  }
});

router.get('/export/ledger/:accountId.csv', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const ledger = await getLedger(req.params.accountId, scopeOf(req));
    if (!ledger) return res.status(404).json({ status: 'error', message: 'Account not found', code: 'NOT_FOUND' });
    const rows = ledger.rows.map((r) => [r.entry.date, r.entry.memo, r.entry.reference || '', r.line.debit, r.line.credit, r.runningBalance]);
    const file = `${ledger.account.code}-ledger.csv`;
    sendCsv(res, file, [['date', 'memo', 'reference', 'debit', 'credit', 'running_balance'], ...rows]);
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid date range', code: 'INVALID_RANGE' });
  }
});

export default router;
