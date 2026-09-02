# Accounting

A lightweight, **double-entry bookkeeping** module with a chart of accounts, a
general journal, and the three classic reports (trial balance, income
statement / P&L, and balance sheet). It is a first-class, file-based module
that needs **no database migration** — data lives in two JSON documents under
`apps/api/data/accounting/`.

- **UI:** Admin → **Finance → Accounting** (`/admin/accounting`)
- **API:** `/api/accounting/*` (admin/manager only)
- **Storage:** `apps/api/data/accounting/accounts.json` + `journal.json`

> **Why file-based?** The store's payments/tax data live in Postgres, but the
> accounting engine is deliberately self-contained. It mirrors the Theme Studio
> "files" storage model: identical behaviour in dev / test / prod, no Prisma
> schema change, trivially backup-able. The core balancing logic is pure and
> unit-tested, so correctness does not depend on a database round-trip.

---

## The double-entry invariant

Every journal entry must **balance**: the sum of all debit lines equals the sum
of all credit lines, to the cent. The server refuses (`400 INVALID_ENTRY`) any
entry that violates this before it touches the ledger. Each line:

- references an **existing, open** account,
- sets **exactly one** of debit/credit (never both, never neither, never negative).

---

## Chart of accounts

Accounts carry a balance on their **normal side**:

| Account class | Normal side |
|---------------|-------------|
| asset, expense | debit |
| liability, equity, revenue | credit |

Codes use the classic grouping so admins can insert accounts without
colliding with the seed:

- `1xxx` assets, `2xxx` liabilities, `3xxx` equity, `4xxx` revenue, `5xxx` expenses.

The seed chart (written on first use) is deliberately small but complete —
every class is represented. Accounts can be **renamed**, **opened/closed**
(deactivated accounts refuse new postings), and **deleted only if they have no
postings**. A handful of anchor accounts (`1000`, `1100`, `1200`, `4000`,
`3000`, `3100`) are system-protected and can never be deleted.

---

## Journal

Posting is **append-only**: entries are never edited or deleted, which gives an
audit trail (an accounting best practice). Each entry carries:

- `date` (business date, `YYYY-MM-DD`),
- `memo` (required, ≤ 240 chars),
- `reference` (optional, e.g. an order or invoice number),
- `lines[]` — the balanced debit/credit legs.

**Correcting a mistake.** Because the journal is append-only (entries are never
deleted), two corrective tools exist:

- **Reverse** — post an exact offset (every debit becomes a credit and
  vice-versa), backed by `POST /api/accounting/entries/:id/reverse`. Use this
  when the entry was *correct but shouldn't stay* (e.g. a miskeyed amount).
  The pair is linked: the original carries `reversedById` and the new entry
  `reversalOf`, so the sale double-post guard knows the original is offset
  and the order can be re-posted. A reversal entry cannot itself be reversed
  (void it instead).
- **Void** — mark the entry `voided` so it stops counting toward balances and
  reports but stays in the journal for the audit trail, backed by
  `POST /api/accounting/entries/:id/void`. Use this when the entry was *never
  supposed to be posted*. Voided entries are excluded everywhere except the
  journal list; closing entries cannot be voided, and an entry with a live
  reversal cannot be voided (void the reversal first — that automatically
  un-reverses the original).

## Posting from orders

The **Post from Order** tab turns a real sale into a journal entry without
hand-typing every leg. Paste an order id, preview the suggested entry, then post
it. The engine derives a balanced entry from the order's own totals:

```
Debit  customer deposits (wallet-applied portion)   storeCredit + giftCard applied
Debit  method asset / accounts receivable           the remainder
Credit product sales                                subtotal − discount
Credit shipping revenue                             shippingAmount
Credit sales tax payable                            taxAmount
```

The debit side mirrors how the order was actually paid:

- the **wallet-applied portion** (store credit + gift card, read from the
  order's authoritative `storeCreditApplied`/`giftCardApplied` columns)
  consumed prepaid customer value → **customer deposits (2200)**;
- the **cash remainder** lands in the account matching the payment method —
  gateway **1200** (Stripe/Zarinpal/IDPay/PayPal/…), bank **1100**
  (`bank_transfer`), cash **1000** (`cash_on_delivery`) — and a method that
  maps nowhere falls back to the gateway account, then any open asset;
- an **unpaid** order goes to accounts receivable **1300** (minus the wallet
  portion).

(Previously every paid order was debited to the gateway account regardless of
method, so COD and bank-transfer money was booked against the Stripe balance,
and wallet+COD orders overstated the cash asset by the wallet portion.)

Accounts are matched by their chart code. Posting is **duplicate-guarded**: an
order whose sale entry is already in the journal is refused, so re-running the
action can't double-post a sale — and the guard ignores voided entries and
reversed pairs, so a corrected posting (post → void, or post → reverse) can be
re-posted afterwards. The built entry runs through the same double-entry
validation as hand-posted entries: an order whose totals do not reconcile is
refused (400) instead of writing an unbalanced row into the ledger.

Refunds are auto-posted the same way: the credit side returns money to the
asset it was paid from (gateway/bank/cash by method) — or to customer deposits
for `creditToStoreCredit` refunds, which move no cash.

## Multi-currency

Every journal entry carries an ISO-4217 **currency** (default `USD`), and every
report/ledger can be scoped to one currency. This is a *per-currency ledger*
model — the common way small businesses keep, say, a USD cash ledger and an EUR
cash ledger as separate books — rather than automated FX conversion. Reports
without a `currency` filter show the whole journal; with `?currency=EUR` they
show only EUR entries. The admin UI has a currency picker on Reports/Ledger and
a currency field on the entry composer.

> No exchange-rate conversion: amounts are recorded in their own currency and
> never automatically restated. Cross-currency totals are only meaningful
> within a single currency.

## Fiscal-year closing

At year end, temporary revenue/expense balances are moved into retained
earnings with a **closing entry** (`POST /api/accounting/entries/close-year/:year`,
per currency). The closing entry is tagged `closing` so the **income statement
and trial balance ignore it** (the closed year's P&L stays intact for historical
reporting) while **balances and the balance sheet include it** (retained
earnings accumulates the profit and the temporary accounts start fresh).
Closing the same year twice is refused.

## Exporting

Trial balance, income statement and any account's ledger download as CSV
(UI buttons + the `/api/accounting/export/*` endpoints). CSV uses the store's
existing `serializeCsv` helper, so exports drop straight into a spreadsheet or
an accountant's import tool.

---

## Reports

All reports derive live from the journal and the chart of accounts, and every
report can be scoped to a **date range** (the admin UI exposes From/To pickers;
the API accepts `?from=&to=`). This makes per-period (monthly, quarterly)
statements trivial without any stored periodisation.

### General ledger
Pick an account to read its complete posting history — every line with its
debit/credit and a running balance that accumulates on the account's normal
side. This is the single-account audit trail (UI: the **Ledger** tab; API:
`GET /api/accounting/ledger/:accountId`).

### Trial balance
Every account's total debits and credits. When the books are balanced the two
grand totals are equal.

### Income statement (P&L)
`net income = total revenue − total expenses`.

### Balance sheet
`assets = liabilities + equity`. The current period's net income is folded into
Retained earnings on the sheet, so the sheet balances when the books do. A
`balancingDifference` (0 when balanced) is surfaced on the admin report card so
a discrepancy is impossible to miss.

---

## API reference

All routes require an **admin/manager** token.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/accounting/accounts` | List chart of accounts (seeds on first use) |
| POST | `/api/accounting/accounts` | Create an account `{code, name, type}` |
| PUT | `/api/accounting/accounts/:id` | Rename / open-close `{name?, active?}` |
| DELETE | `/api/accounting/accounts/:id` | Delete (only if never posted) |
| GET | `/api/accounting/entries` | List journal entries (newest first) |
| GET | `/api/accounting/entries/:id` | Read one entry |
| POST | `/api/accounting/entries` | Post a balanced entry |
| POST | `/api/accounting/entries/:id/reverse` | Post an exact offsetting (reversing) entry |
| POST | `/api/accounting/entries/:id/void` | Void an entry (stops counting, stays in the journal) |
| POST | `/api/accounting/entries/close-year/:year` | Close a fiscal year (net income → retained earnings) |
| GET | `/api/accounting/orders/:orderId/suggest` | Proposed (unposted) sale entry for an order |
| POST | `/api/accounting/orders/:orderId/post` | Post the sale entry for an order (duplicate-guarded) |
| GET | `/api/accounting/ledger/:accountId` | General ledger — posting rows with a running balance |
| GET | `/api/accounting/export/trial-balance.csv` | Trial balance as CSV |
| GET | `/api/accounting/export/income-statement.csv` | Income statement as CSV |
| GET | `/api/accounting/export/ledger/:accountId.csv` | One account's ledger as CSV |
| GET | `/api/accounting/reports/balances` | Every account's net balance |
| GET | `/api/accounting/reports/trial-balance` | Trial balance |
| GET | `/api/accounting/reports/income-statement` | Income statement (P&L) |
| GET | `/api/accounting/reports/balance-sheet` | Balance sheet |

**Date ranges & currencies.** The ledger and every report accept an optional
inclusive period via `?from=YYYY-MM-DD&to=YYYY-MM-DD` and an optional ISO
currency via `?currency=USD`. Invalid or inverted ranges return `400 INVALID_RANGE`.
With no filter, the full journal (all currencies) is used.

Error responses use the store's standard `{status, message, code}` shape.
Validation errors return `400` with a `code` of `INVALID_ACCOUNT` /
`INVALID_ENTRY` / `DELETE_ACCOUNT_FAILED`.

---

## File layout

```
apps/api/src/modules/accounting/
  types.ts                 shared types (Account, JournalEntry, reports)
  chartOfAccounts.ts       default chart seed + system-protected codes
  accountingEngine.ts      PURE double-entry engine (balancing, reports)
  accounting.service.ts    file persistence (JSON) + orchestration
  accounting.routes.ts     express router (/api/accounting)

apps/api/data/accounting/   created on first use (overridable via ACCOUNTING_DIR)
  accounts.json
  journal.json

apps/web/app/admin/accounting/page.tsx   the admin UI
```

---

## Configuration

The storage directory defaults to `apps/api/data/accounting`. Override it with
the `ACCOUNTING_DIR` environment variable (absolute or relative to the API
cwd). Data is plain JSON — back it up with the rest of the store.

Writes are **atomic**: each document is written to a `<file>.tmp` sibling and
then renamed over the target, so a crash mid-write can never leave a
half-written file, and a corrupt file is surfaced as an error rather than
silently reset to empty.

**Multi-instance safety.** Every read/modify/write cycle also takes a
filesystem lock (an `O_EXCL` `.lock` file with staleness recovery) on top of the
in-process mutex, so multiple API instances sharing the same data directory
cannot overwrite each other's updates. This works on any shared filesystem
(NFS, a mounted volume); it does not need a database.

**Auto-posting at checkout.** Set `ACCOUNTING_AUTO_POST=true` to post a sale
entry automatically when a payment is settled (Stripe webhook or staff-recorded
bank transfer/COD) and a refund entry on refund. It is idempotent (the
double-post guard swallows repeats) and best-effort — a posting hiccup never
fails the payment settlement. Two more hooks close the loop on the
customer-deposits liability (2200):

- **Deposit issuance.** Granting store credit (goodwill/adjust) or issuing /
  topping up a gift card now posts `Debit [contra] / Credit 2200` — the
  liability increase is reflected instead of drifting negative over time.
  The contra side is a business judgment: `refund`-type credits book against
  refunds & returns (4200, consistent with `creditToStoreCredit` refunds,
  which post exactly one entry — no double-count), everything else defaults
  to marketing & advertising (5300), and any `accountCode` you pass to
  `POST /api/store-credit`, `/api/store-credit/adjust`,
  `/api/gift-cards` or `/api/gift-cards/:id/credit` wins. A negative
  store-credit adjust posts the mirror (`Debit 2200 / Credit [contra]`).
- **AR settlement.** When an order that was posted while unpaid (booked to
  accounts receivable 1300) is later paid, the sale action — automatic at
  settlement AND the manual **Post from Order** — posts the cash-in transfer
  (`Debit method asset / Credit AR`) that clears the receivable instead of
  refusing. It runs once: a second transfer for the same order is refused.

---

## Tests

- `tests/unit/accounting/accountingEngine.test.ts` — the pure engine: balancing
  rules, normal-side balances, trial balance, P&L, balance sheet, running-balance
  ledger, date-range filtering, reversing, multi-currency scoping.
- `tests/integration/accounting.test.ts` — route-level: access control, account
  CRUD, the double-entry rejection, date-range reporting, multi-currency, voiding,
  fiscal-year closing, order→journal (suggest + post), auto-posting at payment
  settlement, CSV export, and corruption safety.
- `apps/web/app/admin/accounting/page.test.tsx` — the admin UI: accounts table,
  composer balancing gate, reverse/void actions, report rendering, post-from-order,
  CSV export, and close-year.

---

## Known limitations

- **Multi-currency is per-ledger, not FX-converted.** Each entry is recorded in
  its own currency and reports are scoped to one currency; there is no automatic
  exchange-rate conversion or consolidated multi-currency statement.
- **No adjusting periods / journal re-opening.** Closing a fiscal year is
  permanent for that year/currency (re-closing is refused); to adjust a closed
  year you post a normal entry dated in that year and it flows into the
  historical P&L.
- **Append-only by design.** Entries are never edited or deleted; corrections use
  reverse or void (both keep the audit trail).
- **Auto-posting is opt-in.** Set `ACCOUNTING_AUTO_POST=true` to enable posting on
  payment settlement; without it, use the **Post from Order** tab.
- **Shared-filesystem requirement.** The cross-process lock needs all API
  instances to share the same data directory (NFS / mounted volume); it does not
  span separate databases.
- **The contra side of issuance postings is a default, not a science.**
  Store-credit goodwill/adjust and gift-card issuance/top-up book against
  marketing & advertising (5300) by default — the value was given away. If your
  store's economics differ (e.g. you sell gift cards for cash), pass an
  `accountCode` on the wallet API calls (or post a correcting entry) so the
  other side lands where it belongs.
- **AR settlement is one-shot per order.** Posting an order that is unpaid
  (receivable), then paid, then settled posts exactly one cash-in transfer;
  further settlement events are refused — post any additional movement (e.g. a
  partial second collection) manually.
