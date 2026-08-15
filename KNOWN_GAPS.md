# Known gaps

An honest list of what is **not** finished, so nobody discovers it in production.
Everything here is deliberate and documented — not silently broken.

---

## 1. No online card payments

**Status:** offline payment only.

There is no Stripe/PayPal integration. Checkout offers **Cash on Delivery** and
**Bank Transfer**, and orders are created with `paymentStatus: 'pending'`.

`POST /api/payments/process` does *not* contact a gateway — it simply marks an
order paid. It is therefore restricted to **admin/manager**, so staff can record
a bank transfer or a COD collection. It previously accepted any authenticated
customer, which let a buyer mark their own order as paid and receive the goods
for free.

`PAYMENTS_ALLOW_MOCK=true` re-opens it to customers for local demos. **Never
enable this on a public store.**

To go live with cards:
1. Add the Stripe SDK and keys to `apps/api/.env`.
2. Create a PaymentIntent in `payment.routes.ts` instead of the mock branch.
3. Verify the webhook signature before setting `paymentStatus: 'completed'`.
4. Re-add the Credit Card option in `apps/web/app/checkout/page.tsx`.

---

## 2. Email is logged, not delivered

`email.service.ts` connects to SMTP using `SMTP_HOST` / `SMTP_PORT`. With no
SMTP server it degrades gracefully and logs
`📧 Email would be sent to ...` instead of sending.

Order-confirmation and shipping-notification emails are wired into
`order.routes.ts` and will send as soon as real SMTP credentials are set.
For local testing, MailHog on `localhost:1025` works with the defaults.

---

## 3. Settings that are stored but unused

| Field | State |
|---|---|
| `storeAddress` | saved, not displayed anywhere |
| `googleAnalyticsId` | saved, no tracking script injected |

Both persist correctly; nothing consumes them yet.

---

## 4. ~~Admin Users page is read-only~~ — FIXED

Admins can now edit a user's name, role and activation from **Admin → Users**,
via a modal or a one-click Activate/Deactivate on each row.

This file previously claimed *"`PUT /api/users/:id` works, only UI missing"*.
That was **wrong**, and measuring it was the first thing that revealed it: the
route destructured only `{ firstName, lastName, phone, avatar }`, so sending
`role` or `isActive` returned **HTTP 200 with a success payload while silently
discarding the change** — the fake-success bug class that has recurred
throughout this project. The page could never have worked, however good the UI.

The endpoint now validates with Zod against a schema chosen by the caller's
privileges, and enforces:

| Guard | Behaviour |
|---|---|
| Non-admin sends `role`/`isActive` | Stripped by the self schema — no escalation |
| Customer edits another user | 403 |
| Admin changes their own role | 400 |
| Admin deactivates themselves | 400 |
| Demoting/deactivating the last active admin | 400 |
| Unknown role value | 400 |
| Unauthenticated | 401 |

Covered by `scripts/verify-users.py` (21 assertions, API + browser).

---

## 5. No automated tests

There is no test suite. Every change in this repo was verified by driving a real
browser with Playwright and querying the database directly, which catches
integration bugs but is not a substitute for regression tests.

Highest-value tests to add first:
- checkout: valid order persists; rejected order shows an error and keeps the cart
- auth: customer cannot reach admin endpoints (403) or self-approve reviews
- settings: currency and store name propagate to the storefront

---

## 6. Product images are placeholders

Seed products reference `/images/products/*.jpg`, which do not exist on disk and
return 404. `ProductCard` falls back to a generated gradient tile with the
product initials, so nothing looks broken. Upload real images via
**Admin → Products** to replace them.


---

## 7. ~~Unknown pages return HTTP 200 instead of 404 (soft 404)~~ — FIXED

`/category/<unknown>` and `/products/<unknown>` now return a real **HTTP 404**.

The earlier diagnosis in this file was wrong. Converting the root layout from a
client to a server component was necessary but **not sufficient** — a bare
`notFound()` in a trivial server page still returned 200. Next's own docs state
the actual rule:

> "Next.js will return a `200` HTTP status code for streamed responses, and
> `404` for non-streamed responses."

This app always streams: the root layout renders an interactive shell (cart,
theme, toasts, header, footer) and several routes have `loading.tsx`. By the
time `notFound()` runs the headers are already sent, so the status is locked.
Removing `loading.tsx`, hoisting the Suspense boundary, and rewriting to a
static route were each tried and each still produced 200.

**The fix is `apps/web/middleware.ts`**, which runs *before* rendering starts.
It asks the API whether the slug exists and, only on a definitive 404, serves
the real `/not-found` page's HTML with a 404 status. Fail-open by design: any
other outcome (network error, 500, timeout, 3s abort) falls through to normal
rendering, so a flaky API never 404s a valid category.

Two related fixes came out of this:

* `lib/apiBase.ts` — `API_BASE` lived in `lib/http.ts`, which is `'use client'`.
  A server component importing it got a client-reference **Symbol**, and the
  first interpolation threw `Cannot convert a Symbol value to a string`. The
  category page's `catch` swallowed that and returned "unknown", disabling the
  check entirely. `lib/http.ts` re-exports from the new module, so the ~37
  client imports are unchanged.
* The root layout is now a genuine server component (`app/layout.tsx`, 60 lines)
  with the shell in `components/AppShell.tsx`. The two store-name meta tags are
  produced by `generateMetadata` instead of a runtime hook, so crawlers see them
  in the initial HTML.

Covered by `scripts/verify-404.py` (19 real pages stay 200, 5 unknown URLs
return 404, and the 404 page still renders the header, footer and theme).

---

## 8. ~~Only product and category pages have server-side SEO~~ — FIXED

All main routes now use `generateMetadata` (server-side):

| Route | Title |
|---|---|
| `/` | `My Store — Shop the Best Products` |
| `/products` | `All Products \| My Store` |
| `/category/<slug>` | `Clothing \| My Store` |
| `/products/<slug>` | `Classic T-Shirt \| My Store` |

Each has its own canonical URL, Open Graph and Twitter tags, and exactly one
`<title>`. Shared helpers live in `lib/seo.ts`.

## Automated testing & CI (added)

`.github/workflows/ci.yml` runs on every push and PR to `main`:

| Job | Runs | Time |
|---|---|---|
| `api-checks` | `scripts/regression.sh` (32 API assertions), `scripts/audit-silent-writes.py` | ~2 min |
| `ui-checks` | `regression-ui.py` (37 pages), `verify-home-builder.py`, `verify-banner.py`, `verify-gallery.py`, `verify-404.py`, `verify-users.py` | ~8 min |

Both boot the stack from scratch: `npm ci` -> `prisma migrate deploy` ->
`npm run db:seed` -> start API -> (UI job) `next build` -> start web.

Two things had to be fixed before this was worth anything:

1. **`regression.sh` and `audit-silent-writes.py` always exited 0**, even with
   failures - the exit status of their final `echo`/`print`. CI would have
   reported green on a broken build, which is worse than no CI because it
   manufactures confidence. Both now exit 1. `regression-ui.py` had no exit
   code at all and now fails on any broken page, missing add-to-cart button or
   console error.
2. **The main seed had no `strip` banner**, so `verify-banner.py` passed on a
   developer machine (where one had been created by hand) and failed on a
   fresh database. Found on the first from-scratch run. Fixed in
   `prisma/seed.ts`.

Verified by deliberately reintroducing a fixed bug (disabling the `customCss`
XSS guard): the suite went red with `exit=1` and named the failing assertion.

Still missing: unit tests (Vitest is configured but there are no test files),
Sentry or any error tracking, and CD - nothing deploys automatically because
there is no server yet.

