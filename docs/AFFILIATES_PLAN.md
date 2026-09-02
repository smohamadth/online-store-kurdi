# Affiliate Marketing — Implementation Plan

## Goal
Ship a complete affiliate-marketing program for the store builder: affiliates get a
trackable referral link, earn a commission % on paid orders they refer, and request
payouts that an admin approves. Program can be switched off entirely (default OFF —
opt-in like every other optional feature in this codebase).

## Data model (Prisma, 4 new models + Order/StoreSettings columns)
- `Affiliate` — one per user: unique referral `code`, `status` (pending/active/suspended),
  optional `rateOverride`, denormalized lifetime `totalEarned` + `totalPaid` + `clicks`.
- `AffiliateClick` — one row per tracked link visit (affiliateId, ipHash, createdAt).
- `AffiliateCommission` — one per paid order (`orderId` unique → idempotent):
  orderAmount, applied rate, computed amount, currency, status
  (pending → approved | rejected), approvedAt.
- `AffiliatePayout` — withdrawal requests: amount, status (pending → paid | rejected).
- `Order` += `affiliateId` / `affiliateCode` (captured from the `aff_ref` cookie at placement).
- `StoreSettings` += `affiliateEnabled` (default false) + `affiliateRate` (default 10).
- Hand-written SQL migration (repo convention — see scripts/entrypoint-api.sh).

## Lifecycle & rules (final semantics)
- **Apply**: any logged-in user POSTs /api/affiliates/apply → profile with generated
  code, status `pending`. Program disabled → 400.
- **Approve**: admin approves → `active` (totals unchanged).
- **Track**: visitor lands with `?ref=CODE` → storefront client calls
  POST /api/affiliates/track (public, throttled per code+IP, no auth) → valid+active code
  & program on ⇒ click row created + `aff_ref` cookie set (30 days, httpOnly, Path=/);
  anything else ⇒ `{ valid: false }`, no cookie, never an error.
- **Attribution**: order placement reads the `aff_ref` cookie; only stores it when the
  program is enabled AND the code belongs to an active affiliate. Invalid cookies are
  silently ignored — never blocks checkout.
- **Commission**: created when an order flips to paid (all 4 payment-completion sites),
  `amount = round(order.totalAmount × rate / 100)` with `rate = rateOverride ?? store rate`.
  Idempotent on `orderId`; best-effort + never throws (autoPostOrder pattern). No
  commission for canceled/unpaid orders. Suspended-at-payment ⇒ no commission.
- **Reject/approve**: admin approves a pending commission → `approved` (atomic
  `totalEarned += amount`). Reject → `rejected`, terminal.
- **Balance**: `available = Σ approved.amount − totalPaid`.
- **Payout**: affiliate requests (any amount ≤ available, > 0, no other pending request).
  Admin approves → `paid` + atomic `totalPaid += amount`, guarded so the balance still
  covers it; or rejects → terminal.

## API (new module apps/api/src/modules/affiliates/)
- `affiliate.helpers.ts` — pure: code generation, `readCookie`, amount rounding.
- `affiliate.service.ts` — `createCommissionForOrder`, apply, stats, payout math.
- `affiliate.routes.ts` — track (public) + /me + apply + own commissions/clicks/payouts.
- `affiliate.admin.routes.ts` — list/approve/suspend/reactivate/rate; commissions
  approve/reject; payouts approve/reject (admin only).
- Hooks: order.routes.ts (cookie capture), payment.routes.ts ×2, gateway.service.ts,
  services/payment.service.ts (commission on paid), settings.routes.ts (2 new fields).

## Web
- `lib/affiliates.ts` — typed API client (coupons.ts pattern).
- `components/AffiliateRefCapture.tsx` — reads `?ref=` once per code per browser, calls
  track, mounted in AppShell.
- `app/account/affiliate/page.tsx` — apply / pending / suspended / active dashboard
  (share link, stats, commissions, payout request + history). Nav item in AccountShell.
- `app/admin/affiliates/page.tsx` — program settings (enable + rate), affiliate list +
  approve/suspend/rate, commissions approve/reject, payouts approve/reject. Nav item.

## Tests
- Unit: helpers (code gen, cookie parse, rounding), commission service (idempotency,
  no-op paths, rate precedence) with vi.mock prisma.
- Integration (`tests/integration/affiliates.test.ts`): full lifecycle over HTTP —
  apply/approve, track+cookie, attribution at placement (valid/invalid/disabled),
  commission on payment-completion sites (incl. idempotency), override rate, dashboard
  stats, payout request/approve/reject + balance math, admin authz (403 for customers),
  program-disabled paths.
- Web component tests: account page states, admin page actions, ref-capture behavior.

## Explicit non-goals (documented in KNOWN_GAPS.md)
- No accounting auto-posting for commissions (chart-of-accounts dependent; affiliate
  ledger is internal and auditable via the tables).
- Click tracking is per-browser/cookie based; no device fingerprinting or cross-device
  attribution.
- Payouts are admin-verified manual transfers (no gateway payout API).
