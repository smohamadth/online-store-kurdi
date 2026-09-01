// ---------------------------------------------------------------------------
// Accounting service — file persistence + orchestration.
//
// Stores the chart of accounts and the general journal as two JSON documents
// under <ACCOUNTING_DIR or apps/api/data/accounting>/. This mirrors the
// themeStudio "files" model: no database migration, identical behaviour in
// dev / test / prod, trivially backup-able.
//
// All reads and writes are serialised through a small in-process mutex so two
// concurrent postings cannot lose each other's updates (the engine's balancing
// invariant is checked against the freshly-loaded state).
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';

import { prisma } from '../../config/database';
import { DEFAULT_CHART_OF_ACCOUNTS, SYSTEM_ACCOUNT_CODES } from './chartOfAccounts';
import {
  validateJournalEntry,
  validateDateRange,
  normalizeEntry,
  postedEntries,
  filterByCurrency,
  accountBalance,
  filterEntriesByDate,
  computeAccountBalances,
  trialBalance,
  incomeStatement,
  balanceSheet,
  ledgerWithRunningBalance,
  reverseEntry,
  accountHasPostings,
  round2,
} from './accountingEngine';
import { ACCOUNT_TYPE_NORMAL_SIDE, DEFAULT_CURRENCY } from './types';
import type { Account, AccountType, JournalEntry, JournalLine, NewJournalEntry } from './types';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const rename = promisify(fs.rename);
const mkdir = promisify(fs.mkdir);

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const ACCOUNT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{1,15}$/;

function dataDir(): string {
  return path.resolve(process.cwd(), process.env.ACCOUNTING_DIR || 'data/accounting');
}
const accountsPath = () => path.join(dataDir(), 'accounts.json');
const journalPath = () => path.join(dataDir(), 'journal.json');

// ---------------------------------------------------------------------------
// Cross-process-safe locking.
//
// Two layers:
//   1. an in-process promise mutex, so concurrent awaits in one process never
//      interleave their read/modify/write cycles, and
//   2. a filesystem lock (an O_EXCL `.lock` file), so MULTIPLE API instances
//      sharing the same data dir don't overwrite each other's updates.
//
// The lock file carries the holder's pid; a stale lock (a crash leaves one
// behind) older than a few seconds is broken so a dead instance can't wedge
// the store forever.
// ---------------------------------------------------------------------------
let queue: Promise<unknown> = Promise.resolve();

const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = 10_000;

async function acquireFileLock(): Promise<() => Promise<void>> {
  const lockPath = path.join(dataDir(), '.lock');
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      await ensureDir();
      const fd = fs.openSync(lockPath, 'wx');
      fs.closeSync(fd);
      fs.writeFileSync(lockPath, String(process.pid));
      return async () => {
        try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
      };
    } catch {
      // Lock held (by another process, or a stale leftover). If it is stale,
      // remove it and retry; otherwise back off until the deadline.
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) fs.unlinkSync(lockPath);
      } catch { /* lock disappeared — retry now */ }
      if (Date.now() > deadline) {
        throw new Error('Could not acquire accounting file lock (timeout)');
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/** Run `fn` under BOTH the in-process mutex and the filesystem lock. */
async function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquireFileLock();
  try {
    return await withLock(fn);
  } finally {
    await release();
  }
}

async function ensureDir() {
  await mkdir(dataDir(), { recursive: true });
}

/**
 * Read a JSON document. A missing file returns the fallback; a file that exists
 * but does not parse is NOT silently discarded (that would wipe the ledger on a
 * corrupt write) — it throws so the caller surfaces the corruption instead.
 */
async function loadJson<T>(file: string, fallback: T): Promise<T> {
  if (!fs.existsSync(file)) return fallback;
  const raw = await readFile(file, 'utf8');
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Corrupted accounting data file: ${file} — restore it from a backup or from the latest .tmp`);
  }
}

/**
 * Atomic JSON write: write to `<file>.tmp` then rename over the target. On POSIX
 * rename is atomic, so a crash mid-write can never leave a half-written
 * accounts.json / journal.json behind — the previous good file stays until the
 * new one is fully on disk.
 */
async function saveJsonAtomic(file: string, value: unknown): Promise<void> {
  await ensureDir();
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, file);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * Internal (lock-free) loader. Callers that have already acquired the lock use
 * this so they do not deadlock on the same mutex. Seeds the default chart on
 * first use.
 */
async function readAccounts(): Promise<Account[]> {
  await ensureDir();
  const file = accountsPath();
  const existing = await loadJson<Account[]>(file, []);
  if (existing.length > 0) return existing.sort((a, b) => a.code.localeCompare(b.code));

  const seeded: Account[] = DEFAULT_CHART_OF_ACCOUNTS.map((seed) => ({
    ...seed,
    id: crypto.randomUUID(),
  }));
  await saveJsonAtomic(file, seeded);
  return seeded;
}

/** Public read of the chart of accounts, seeding the default on first use. */
export async function listAccounts(): Promise<Account[]> {
  return withStoreLock(readAccounts);
}

export async function createAccount(input: {
  code: string;
  name: string;
  type: AccountType;
}): Promise<Account> {
  return withStoreLock(async () => {
    const accounts = await readAccounts();
    if (!ACCOUNT_TYPES.includes(input.type)) {
      throw new Error(`Account type must be one of: ${ACCOUNT_TYPES.join(', ')}`);
    }
    const code = (input.code || '').trim();
    if (!ACCOUNT_CODE_RE.test(code)) {
      throw new Error('Account code must be 2–16 characters of letters, digits or dashes');
    }
    if (accounts.some((a) => a.code.toLowerCase() === code.toLowerCase())) {
      throw new Error(`An account with code "${code}" already exists`);
    }
    const name = (input.name || '').trim();
    if (!name) throw new Error('Account name is required');

    const account: Account = {
      id: crypto.randomUUID(),
      code,
      name,
      type: input.type,
      normalSide: ACCOUNT_TYPE_NORMAL_SIDE[input.type],
      active: true,
    };
    const next = [...accounts, account];
    await saveJsonAtomic(accountsPath(), next);
    return account;
  });
}

export async function updateAccount(id: string, patch: { name?: string; active?: boolean }): Promise<Account> {
  return withStoreLock(async () => {
    const accounts = await readAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('Account not found');
    const account = accounts[idx];

    const next = { ...account };
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (!name) throw new Error('Account name is required');
      next.name = name;
    }
    if (patch.active !== undefined) {
      next.active = Boolean(patch.active);
    }
    const updated = [...accounts];
    updated[idx] = next;
    await saveJsonAtomic(accountsPath(), updated);
    return next;
  });
}

export async function deleteAccount(id: string): Promise<void> {
  return withStoreLock(async () => {
    const accounts = await readAccounts();
    const account = accounts.find((a) => a.id === id);
    if (!account) throw new Error('Account not found');
    if (SYSTEM_ACCOUNT_CODES.includes(account.code)) {
      throw new Error(`Account "${account.code}" is system-protected and cannot be deleted`);
    }
    const entries = await loadJournal();
    if (accountHasPostings(id, entries)) {
      throw new Error(`Account "${account.name}" has journal postings; deactivate it instead of deleting`);
    }
    const next = accounts.filter((a) => a.id !== id);
    await saveJsonAtomic(accountsPath(), next);
  });
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

async function loadJournal(): Promise<JournalEntry[]> {
  const raw = await loadJson<JournalEntry[]>(journalPath(), []);
  return raw.map(normalizeEntry);
}

export async function listEntries(): Promise<JournalEntry[]> {
  return withStoreLock(async () => {
    const entries = await loadJournal();
    return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  });
}

export async function getEntry(id: string): Promise<JournalEntry | null> {
  return withStoreLock(async () => {
    const entries = await loadJournal();
    return entries.find((e) => e.id === id) ?? null;
  });
}

/** Post a validated journal entry (append-only). Returns the stored entry. */
export async function postEntry(input: NewJournalEntry): Promise<JournalEntry> {
  return withStoreLock(async () => {
    const accounts = await readAccounts();
    const validated = validateJournalEntry(accounts, input);
    const entry: JournalEntry = {
      ...validated,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const entries = await loadJournal();
    await saveJsonAtomic(journalPath(), [...entries, entry]);
    return entry;
  });
}

/**
 * Post an exact-offset (reversing) entry for an existing one. This is how a
 * mistaken posting is corrected while keeping the journal append-only.
 *
 * The pair is linked: the original gets `reversedById` (so the sale
 * double-post guard knows it is offset and the order can be re-posted) and
 * the new entry gets `reversalOf` (so it is never mistaken for a posting).
 */
export async function reversePostedEntry(id: string): Promise<JournalEntry> {
  return withStoreLock(async () => {
    const all = await loadJournal();
    const idx = all.findIndex((e) => e.id === id);
    const entry = all[idx];
    if (!entry) throw new Error('Entry not found');
    // Same guards as voidEntry: a voided entry no longer counts toward
    // balances, so posting its "reversal" would leave a phantom offset
    // that distorts the books; closing entries must stay immutable.
    if (entry.voided) throw new Error('Cannot reverse a voided entry');
    if (entry.kind === 'closing') throw new Error('Cannot reverse a closing entry');
    // A reversal is itself an offset: reversing IT would recreate the
    // original effect. Void the reversal instead (which un-reverses the
    // original) or post a fresh offsetting entry.
    if (entry.reversalOf) throw new Error('Cannot reverse a reversing entry — void it instead');
    const accounts = await readAccounts();
    const validated = validateJournalEntry(accounts, reverseEntry(entry));
    const reversed: JournalEntry = {
      ...validated,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reversalOf: entry.id,
    };
    const updated = [...all];
    updated[idx] = { ...entry, reversedById: reversed.id };
    updated.push(reversed);
    await saveJsonAtomic(journalPath(), updated);
    return reversed;
  });
}

// ---------------------------------------------------------------------------
// Order → journal (closes the "manual posting only" gap)
//
// A sale is posted with a single click from the order. The engine builds a
// balanced entry from the order's own totals:
//
//   Debit  payment gateway / accounts receivable   totalAmount
//   Credit product sales                           subtotal - discount
//   Credit shipping revenue                        shippingAmount
//   Credit sales tax payable                       taxAmount
//
// The debit account is chosen by payment status (paid ⇒ the payment-gateway
// asset; otherwise accounts receivable). Accounts are looked up by their chart
// code, so an admin who renames an account still matches it.
// ---------------------------------------------------------------------------

interface OrderLike {
  id: string;
  orderNumber: string;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod?: string | null;
  storeCreditApplied?: number | null;
  giftCardApplied?: number | null;
  createdAt: Date;
}

async function accountByCode(accounts: Account[], code: string, purpose: string): Promise<Account> {
  const a = accounts.find((x) => x.code === code && x.active);
  if (!a) {
    throw new Error(`The "${purpose}" account (code ${code}) is missing or closed — add it to the chart of accounts`);
  }
  return a;
}

/**
 * Pick the asset account a payment method settles into, by chart code:
 *
 *   stripe / zarinpal / idpay / paypal / zaincash / fib  -> 1200 gateway
 *   bank_transfer                                        -> 1100 bank
 *   cash_on_delivery / cod                               -> 1000 cash
 *
 * The old code debited the gateway account for EVERY paid order, so a COD
 * sale (cash collected at the door) or a bank transfer (money in the bank)
 * was booked against the Stripe balance — the cash accounts never moved.
 * Unknown methods fall back to the gateway account, then any open asset
 * account, so a renamed/closed 1200 cannot block posting.
 */
function assetAccountForPaymentMethod(accounts: Account[], method?: string | null): Account {
  const m = (method || '').toLowerCase();
  const preferred =
    m === 'bank_transfer' || m === 'bank'
      ? '1100'
      : m === 'cash_on_delivery' || m === 'cod'
        ? '1000'
        : '1200';
  const found = accounts.find((x) => x.code === preferred && x.active);
  if (found) return found;
  const gateway = accounts.find((x) => x.code === '1200' && x.active);
  if (gateway) return gateway;
  const openAsset = accounts.find((x) => x.type === 'asset' && x.active);
  if (openAsset) return openAsset;
  throw new Error('No open asset account — add one (e.g. code 1200) to the chart of accounts');
}

/**
 * Build a balanced journal entry from an order (not yet posted).
 *
 * The debit side reflects HOW the order was actually paid:
 *   - the wallet-applied portion (store credit + gift card) consumed
 *     prepaid customer value -> customer deposits (2200);
 *   - the cash remainder lands in the account that matches the payment
 *     method (gateway 1200 / bank 1100 / cash 1000) — or accounts
 *     receivable (1300) when the order is not paid yet;
 *   - a wallet-covered order with no deposits account falls back to the
 *     cash asset so the revenue still gets recognized (documented).
 */
export async function buildOrderEntry(order: OrderLike): Promise<NewJournalEntry> {
  const accounts = await readAccounts();
  const sales = await accountByCode(accounts, '4000', 'product sales');
  const shipping = await accountByCode(accounts, '4100', 'shipping revenue');
  const tax = await accountByCode(accounts, '2100', 'sales tax payable');
  const receivable = await accountByCode(accounts, '1300', 'accounts receivable');

  const paid = ['completed', 'paid'].includes(order.paymentStatus.toLowerCase());
  const amount = Math.round(order.totalAmount * 100) / 100;
  const salesAmount = Math.round((order.subtotal - (order.discountAmount || 0)) * 100) / 100;
  const shippingAmount = Math.round((order.shippingAmount || 0) * 100) / 100;
  const taxAmount = Math.round((order.taxAmount || 0) * 100) / 100;

  // Wallet-applied credit is authoritative on the order row (server-set at
  // checkout). The old code probed the Payment rows and only handled the
  // fully-covered case; a wallet+COD/bank order debited the WHOLE amount to
  // the cash asset even though the wallet portion never moved cash.
  const walletApplied = Math.min(
    amount,
    Math.round(((order.storeCreditApplied || 0) + (order.giftCardApplied || 0)) * 100) / 100,
  );
  const deposits = accounts.find((x) => x.code === '2200' && x.active);

  const debitLines: JournalLine[] = [];
  let cashRemainder = amount;
  if (walletApplied > 0 && deposits) {
    debitLines.push({ accountId: deposits.id, debit: walletApplied, credit: 0 });
    cashRemainder = Math.round((amount - walletApplied) * 100) / 100;
  }
  if (cashRemainder > 0) {
    const assetAccount = paid
      ? assetAccountForPaymentMethod(accounts, order.paymentMethod)
      : receivable;
    debitLines.push({ accountId: assetAccount.id, debit: cashRemainder, credit: 0 });
  }

  return {
    date: order.createdAt.toISOString().slice(0, 10),
    memo: `Sale — order ${order.orderNumber}`,
    reference: order.orderNumber,
    currency: DEFAULT_CURRENCY,
    lines: [
      ...debitLines,
      { accountId: sales.id, debit: 0, credit: salesAmount },
      ...(shippingAmount > 0 ? [{ accountId: shipping.id, debit: 0, credit: shippingAmount }] : []),
      ...(taxAmount > 0 ? [{ accountId: tax.id, debit: 0, credit: taxAmount }] : []),
    ],
  };
}

/** A proposed journal entry for an order, for admin review (no write). */
export async function suggestOrderEntry(orderId: string): Promise<{ order: OrderLike; entry: NewJournalEntry }> {
  const order = (await prisma.order.findUnique({ where: { id: orderId } })) as OrderLike | null;
  if (!order) throw new Error('Order not found');
  const built = await buildOrderEntry(order);
  // Validate up-front so an order whose totals do not reconcile is flagged
  // at review time (the entry would be refused at post time anyway).
  const entry = validateJournalEntry(await readAccounts(), built);
  return { order, entry };
}

/**
 * Post the sale entry for an order. Guards against double-posting: an order
 * whose reference is already in the journal is refused, so re-running the
 * action cannot create a duplicate entry.
 *
 * The guard ignores entries that no longer represent the sale: VOIDED
 * entries (the "never should have been posted" correction must allow a
 * correct re-post), entries OFFSET by a reversal (`reversedById`), and the
 * reversal entries themselves (`reversalOf` — they are offsets, not
 * postings). Without this, post → reverse (or post → void) permanently
 * orphaned the order from the ledger: every later attempt was refused.
 */
export async function postOrderEntry(orderId: string): Promise<JournalEntry> {
  return withStoreLock(async () => {
    const order = (await prisma.order.findUnique({ where: { id: orderId } })) as OrderLike | null;
    if (!order) throw new Error('Order not found');

    const existing = await loadJournal();
    const alreadyPosted = existing.some(
      (e) =>
        e.reference === order.orderNumber &&
        !e.voided &&
        !e.reversedById &&
        !e.reversalOf,
    );
    if (alreadyPosted) {
      throw new Error(`Order ${order.orderNumber} is already posted to the ledger`);
    }

    const built = await buildOrderEntry(order);
    // Defense in depth: the double-entry invariant is enforced on every
    // OTHER write path (postEntry runs validateJournalEntry), and the
    // order path must not bypass it. An order whose totals do not
    // reconcile (legacy data, a bug, tampering) is refused here with a
    // clear message instead of corrupting the ledger with an unbalanced
    // entry — auto-posting stays best-effort and just skips it.
    const validated = validateJournalEntry(await readAccounts(), built);
    const entry: JournalEntry = {
      ...validated,
      currency: validated.currency || DEFAULT_CURRENCY,
      voided: false,
      kind: 'normal',
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await saveJsonAtomic(journalPath(), [...existing, entry]);
    return entry;
  });
}

// ---------------------------------------------------------------------------
// Voiding, fiscal-year closing, auto-posting
// ---------------------------------------------------------------------------

/**
 * Void a posted entry: mark it voided so it stops counting toward balances and
 * reports, while keeping the original row in the journal for the audit trail.
 * The append-only principle is preserved — nothing is deleted.
 *
 * Pair rules (a voided entry must never leave a phantom offset behind):
 *   - an entry with a live reversal (`reversedById`) cannot be voided —
 *     voiding it would leave the reversal counting with nothing to offset;
 *   - voiding a REVERSAL entry un-reverses the original (its `reversedById`
 *     pointer is cleared), so the original is live again.
 */
export async function voidEntry(id: string): Promise<JournalEntry> {
  return withStoreLock(async () => {
    const all = await loadJournal();
    const idx = all.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Entry not found');
    if (all[idx].voided) throw new Error('Entry is already voided');
    if (all[idx].kind === 'closing') throw new Error('Closing entries cannot be voided');
    if (all[idx].reversedById) {
      throw new Error('Entry has a live reversing entry — void the reversal first');
    }
    const updated = [...all];
    if (all[idx].reversalOf) {
      const origIdx = all.findIndex((e) => e.id === all[idx].reversalOf);
      if (origIdx !== -1 && updated[origIdx].reversedById === id) {
        const orig = { ...updated[origIdx] };
        delete orig.reversedById;
        updated[origIdx] = orig;
      }
    }
    updated[idx] = { ...all[idx], voided: true };
    await saveJsonAtomic(journalPath(), updated);
    return updated[idx];
  });
}

/**
 * Close a fiscal year: transfer that year's net income (in a given currency)
 * from the temporary revenue/expense accounts into retained earnings via a
 * `closing` entry. The income statement and trial balance ignore closing
 * entries, so the closed year's P&L stays intact; balances and the balance
 * sheet include them, so retained earnings accumulates the profit.
 */
export async function closeFiscalYear(year: number, currency: string = DEFAULT_CURRENCY): Promise<JournalEntry> {
  return withStoreLock(async () => {
    const all = await loadJournal();
    const yearStr = String(year);
    if (!/^\d{4}$/.test(yearStr)) throw new Error('Year must be a 4-digit number');

    // Guard against double-closing the same year/currency.
    if (all.some((e) => e.kind === 'closing' && e.currency === currency && e.date.startsWith(`${yearStr}-`))) {
      throw new Error(`Fiscal year ${yearStr} (${currency}) is already closed`);
    }

    const accounts = await readAccounts();
    const inYear = postedEntries(all).filter(
      (e) => e.kind !== 'closing' && e.currency === currency && e.date.startsWith(`${yearStr}-`)
    );
    const revenueAccounts = accounts.filter((a) => a.type === 'revenue');
    const expenseAccounts = accounts.filter((a) => a.type === 'expense');

    const lines: JournalLine[] = [];
    for (const a of revenueAccounts) {
      const bal = round2(accountBalance(a, inYear));
      // Close BOTH directions: a positive (credit) balance is zeroed with a
      // debit, but a negative (contra — refunds exceeding sales on this
      // account) balance must be zeroed with a credit, or the negative
      // carries into next year's P&L as if it were current-year activity.
      if (bal > 0) lines.push({ accountId: a.id, debit: bal, credit: 0 });
      else if (bal < 0) lines.push({ accountId: a.id, debit: 0, credit: -bal });
    }
    for (const a of expenseAccounts) {
      const bal = round2(accountBalance(a, inYear));
      if (bal > 0) lines.push({ accountId: a.id, debit: 0, credit: bal });
      else if (bal < 0) lines.push({ accountId: a.id, debit: -bal, credit: 0 });
    }
    const totalRevenue = lines.reduce((s, l) => s + l.debit, 0);
    const totalExpenses = lines.reduce((s, l) => s + l.credit, 0);
    const netIncome = round2(totalRevenue - totalExpenses);

    const retained = await accountByCode(accounts, '3100', 'retained earnings');
    if (netIncome >= 0) {
      lines.push({ accountId: retained.id, debit: 0, credit: netIncome });
    } else {
      lines.push({ accountId: retained.id, debit: Math.abs(netIncome), credit: 0 });
    }

    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      date: `${yearStr}-12-31`,
      memo: `Close fiscal year ${yearStr}`,
      currency,
      lines,
      createdAt: new Date().toISOString(),
      voided: false,
      kind: 'closing',
    };
    await saveJsonAtomic(journalPath(), [...all, entry]);
    return entry;
  });
}

/**
 * Best-effort auto-posting for a settled order. Enabled with
 * ACCOUNTING_AUTO_POST=true; idempotent (the double-post guard swallows a
 * repeat). Never throws — a posting failure must not break payment settlement.
 */
export async function autoPostOrder(orderId: string): Promise<JournalEntry | null> {
  if (process.env.ACCOUNTING_AUTO_POST !== 'true') return null;
  try {
    return await postOrderEntry(orderId);
  } catch {
    return null;
  }
}

/**
 * Best-effort refund posting: debit refunds/returns, credit the account the
 * money came from. Used when a completed payment is refunded. Never throws.
 *
 * The credit side mirrors the ORIGINAL payment: a cash refund returns money
 * to the asset it was paid from (gateway 1200 / bank 1100 / cash 1000 — the
 * old code credited the gateway for every refund, so a bank-transferred or
 * COD order's refund was booked against the Stripe balance). A
 * `toStoreCredit` refund returns value to the customer's store-credit
 * balance — no cash moves — so the credit side is the customer-deposits
 * liability (2200); if a custom chart removed that account the posting is
 * skipped rather than fabricating a cash event.
 */
export async function autoPostRefund(
  orderId: string,
  amount: number,
  opts?: { toStoreCredit?: boolean },
): Promise<JournalEntry | null> {
  if (process.env.ACCOUNTING_AUTO_POST !== 'true') return null;
  try {
    return await withStoreLock(async () => {
      const accounts = await readAccounts();
      const refunds = await accountByCode(accounts, '4200', 'refunds & returns');
      // The order row is fetched for its payment method + human order
      // number (the memo/reference should say ORD-…, not a UUID). Fall
      // back to the orderId when the row is somehow gone.
      const order = (await prisma.order.findUnique({ where: { id: orderId } })) as OrderLike | null;
      let creditAccount: Account;
      if (opts?.toStoreCredit) {
        const deposits = accounts.find((x) => x.code === '2200' && x.active);
        if (!deposits) return null; // no deposit liability account: skip, don't fabricate cash
        creditAccount = deposits;
      } else {
        creditAccount = order
          ? assetAccountForPaymentMethod(accounts, order.paymentMethod)
          : await accountByCode(accounts, '1200', 'payment gateway');
      }
      const entry: JournalEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString().slice(0, 10),
        memo: `Refund — order ${order?.orderNumber ?? orderId}`,
        // The reference stays the order ID (NOT the order number): partial
        // refunds legitimately share one order, and the sale entry's
        // double-post guard matches on the order number — a refund entry
        // must never look like the order's sale entry.
        reference: orderId,
        currency: DEFAULT_CURRENCY,
        lines: [
          { accountId: refunds.id, debit: Math.round(amount * 100) / 100, credit: 0 },
          { accountId: creditAccount.id, debit: 0, credit: Math.round(amount * 100) / 100 },
        ],
        createdAt: new Date().toISOString(),
        voided: false,
        kind: 'normal',
      };
      const all = await loadJournal();
      await saveJsonAtomic(journalPath(), [...all, entry]);
      return entry;
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reports
//
// Every report accepts an optional inclusive [from, to] date range and an
// optional ISO currency code (default: the whole journal, all currencies; the
// UI/API commonly pass a currency to keep a multi-currency ledger readable).
//
//   - trial balance & income statement: exclude voided AND closing entries, so
//     the closing transfer never zeroes out a period's P&L.
//   - balances & balance sheet: exclude voided but INCLUDE closing entries, so
//     retained earnings accumulates the closed years' net income.
//   - ledger: exclude voided, include closing (full audit trail).
// ---------------------------------------------------------------------------

interface ReportScope { range?: { from?: string; to?: string }; currency?: string; }

function scoped(entries: JournalEntry[], scope: ReportScope): JournalEntry[] {
  return filterByCurrency(filterEntriesByDate(entries, validateDateRange(scope.range)), scope.currency);
}

function scopedForPnl(entries: JournalEntry[], scope: ReportScope): JournalEntry[] {
  return postedEntries(scoped(entries, scope)).filter((e) => e.kind !== 'closing');
}

export async function getTrialBalance(scope: ReportScope = {}) {
  return withStoreLock(async () => {
    const [accounts, all] = await Promise.all([readAccounts(), loadJournal()]);
    return trialBalance(accounts, scopedForPnl(all, scope));
  });
}

export async function getIncomeStatement(scope: ReportScope = {}) {
  return withStoreLock(async () => {
    const [accounts, all] = await Promise.all([readAccounts(), loadJournal()]);
    return incomeStatement(accounts, scopedForPnl(all, scope));
  });
}

export async function getBalanceSheet(scope: ReportScope = {}) {
  return withStoreLock(async () => {
    const [accounts, all] = await Promise.all([readAccounts(), loadJournal()]);
    return balanceSheet(accounts, postedEntries(scoped(all, scope)));
  });
}

export async function getAccountBalances(scope: ReportScope = {}) {
  return withStoreLock(async () => {
    const [accounts, all] = await Promise.all([readAccounts(), loadJournal()]);
    return computeAccountBalances(accounts, postedEntries(scoped(all, scope)));
  });
}

/**
 * General ledger for one account: every posting line with a running balance,
 * optionally scoped to a date range and currency.
 */
export async function getLedger(accountId: string, scope: ReportScope = {}) {
  return withStoreLock(async () => {
    const [accounts, all] = await Promise.all([readAccounts(), loadJournal()]);
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return null;
    const entries = postedEntries(scoped(all, scope));
    return { account, rows: ledgerWithRunningBalance(account, entries) };
  });
}
