# Affiliate Marketing

The affiliate program lets your customers earn a commission on sales they
refer. It is **off by default** — enable it in **Admin → Affiliates**.

## How it works

1. **Enable** the program in Admin → Affiliates and set the default
   commission rate (percent of the paid order total; default 10%).
2. **Customers apply** from Account → Affiliate. Each applicant gets a
   unique referral code (`NAME-XXXX`) and a profile with status
   `pending`.
3. **You approve** applications in Admin → Affiliates (`pending` →
   `active`). Only active affiliates earn.
4. **Affiliates share** their link, e.g. `https://yourstore.com/?ref=MARTIN-7K2F`.
5. **Visitors who click it** get a 30-day `aff_ref` cookie (set
   server-side, httpOnly). Every tracked click is recorded.
6. **When a referred customer's order is paid**, a commission is created
   automatically: `order total × rate %`, in the store's currency.
   Commission status is `pending` until you approve or reject it.
7. **Payouts**: the affiliate requests a withdrawal of their available
   balance (approved commissions − already paid). You mark it paid after
   the real transfer (bank / PayPal) happens, or reject it.

## Lifecycle & rules

| Thing            | Transition                        | Effect on balances               |
| ---------------- | --------------------------------- | -------------------------------- |
| Application      | `pending` → `active` (admin)      | starts earning                   |
| Affiliate        | `active` → `suspended` (admin)    | stops earning; new links ignored |
| Commission       | `pending` → `approved` (admin)    | `totalEarned += amount`          |
| Commission       | `pending` → `rejected` (admin)    | terminal; never counted          |
| Commission       | `pending`/`approved` → `voided`   | refund clawback or manual admin reversal; `totalEarned -= amount` if it was approved (floored at 0) |
| Payout request   | `pending` → `paid` (admin)        | `totalPaid += amount`            |
| Payout request   | `pending` → `rejected` (admin)    | terminal; balance untouched      |

- **Available balance** = sum of approved commissions − sum of paid
  payouts. Never negative (clamped).
- A commission is created **once per order** (unique on `orderId`), so
  payment webhook replays can never double-pay.
- Orders are attributed only when the program is on **and** the code
  belongs to an **active** affiliate at checkout. A stale or fake
  `?ref=` never blocks checkout — it is silently ignored.
- If an affiliate is suspended when an order is *paid*, that order does
  not earn. Turning the program **off** does not void commissions for
  orders placed while it was on.
- A **full refund** voids the order's commission automatically (pending
  or approved) and claws back `totalEarned` when it was approved — the
  refund path never fails because of the affiliate ledger (best-effort).
  Partial refunds leave the commission alone; the admin can void it
  manually (Admin → Affiliates → Commissions → Void).
- Buying through your own link never earns: the affiliate is not their
  own customer.
- Per-affiliate rate overrides: Admin → Affiliates → set a custom % for a
  specific affiliate (or reset to the store default). Rates are 0–100.

## API surface

| Endpoint                              | Access  | Purpose                              |
| ------------------------------------- | ------- | ------------------------------------ |
| `POST /api/affiliates/track`          | public  | record click + set `aff_ref` cookie  |
| `POST /api/affiliates/apply`          | auth    | join the program                     |
| `GET /api/affiliates/me`              | auth    | own profile + stats                  |
| `GET /api/affiliates/me/commissions`  | auth    | own commission ledger                |
| `GET /api/affiliates/me/clicks`       | auth    | own click history                    |
| `GET/POST /api/affiliates/me/payouts` | auth    | own payout requests / request one    |
| `GET /api/affiliates`                 | admin   | list affiliates                      |
| `POST /api/affiliates/:id/approve`    | admin   | approve / reactivate                 |
| `POST /api/affiliates/:id/suspend`    | admin   | suspend                              |
| `PUT /api/affiliates/:id/rate`        | admin   | per-affiliate rate override          |
| `GET /api/affiliates/commissions`     | admin   | commission ledger                    |
| `POST /api/affiliates/commissions/:id/approve\|reject\|void` | admin | resolve / reverse a commission |
| `GET /api/affiliates/payouts`         | admin   | payout requests                      |
| `POST /api/affiliates/payouts/:id/approve\|reject`     | admin | resolve a payout     |

Program settings live on `StoreSettings`: `affiliateEnabled` (bool) and
`affiliateRate` (float, percent), editable via `PUT /api/settings`.

## Honest limits

- Attribution is **browser-cookie based** — no cross-device tracking.
  The click counter is throttled (one per code+IP per 60s) and recorded
  once per browser per code, so it intentionally undercounts shared
  machines rather than inflate.
- Payouts are **manual transfers** you verify off-platform; the program
  tracks requests and balances, not bank movements.
- Commissions are **not posted to the accounting chart**; the
  `AffiliateCommission` / `AffiliatePayout` tables are the append-only
  ledger. (See KNOWN_GAPS §18 for the accounting-posting design.)
