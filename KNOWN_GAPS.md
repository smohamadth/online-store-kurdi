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

## 4. Admin Users page is read-only

`/admin/users` lists users but cannot change a role, deactivate an account, or
delete a user. The `PUT /api/users/:id` endpoint exists and works — only the UI
is missing.

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

## 7. Unknown pages return HTTP 200 instead of 404 (soft 404)

`/category/<unknown>` and `/products/<unknown>` render the correct
"not found" page, but the HTTP status is **200**.

Investigated thoroughly. `notFound()` **is** being called from a server
component — confirmed by logging (`exists=false`) — and a minimal probe route
proved `notFound()` returns a real 404 elsewhere in this app. The cause is
`app/layout.tsx` being a **client component** (`'use client'`, 872 lines):
the HTML shell is committed before page rendering completes, so `notFound()`
can still render `not-found.tsx` but can no longer change the status code.

Unknown *routes* (e.g. `/no-such-page`) do correctly return 404, because Next
resolves those before rendering.

Proper fix: convert the root layout to a server component, moving Header,
DynamicFooter, CartProvider, ThemeProvider and the other hook-using pieces
into client children. That is a large, high-risk refactor of the app shell and
was deliberately not attempted alongside other changes.

Impact: search engines may index the "not found" page rather than dropping it.
Users see the correct page either way.

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
| `ui-checks` | `regression-ui.py` (37 pages), `verify-home-builder.py`, `verify-banner.py`, `verify-gallery.py` | ~6 min |

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

