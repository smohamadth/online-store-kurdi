# Known gaps

An honest list of what is **not** finished, so nobody discovers it in production.
Everything here is deliberate and documented — not silently broken.

---

## 1. ~~No online card payments~~ — Stripe integrated (optional per store)

**Status:** card payment works when the store configures Stripe; otherwise
the offline flow remains.

The store ships **without** a payment gateway on purpose: it installs on the
client's server, and the merchant decides whether to take cards. Two modes:

* **Offline (default).** No `STRIPE_SECRET_KEY` → checkout offers **Cash on
  Delivery** and **Bank Transfer**; orders are created `paymentStatus:
  'pending'` and staff settle them via `POST /api/payments/process`
  (admin/manager only — a customer can never mark their own order paid).
  `PAYMENTS_ALLOW_MOCK=true` re-opens it for local demos; **never enable it on
  a public store.**

* **Stripe (opt-in per store).** Set `STRIPE_SECRET_KEY` +
  `STRIPE_WEBHOOK_SECRET` (see `.env.example`) and the card option appears in
  checkout. Order placement creates a **Stripe Checkout** session (hosted
  page — no card data touches this server); the customer pays and is sent back
  to `/checkout?paid=true` (or `?canceled=true`). A **verified** webhook
  (`checkout.session.completed`, signature-checked via
  `stripe.webhooks.constructEvent` against the raw request body) settles the
  order idempotently — Stripe retries never create duplicate payments. If the
  store has no Stripe keys, a card order is rejected with 400 *before* the
  order row is created, so a customer is never left with an unpayable pending
  order.

To go live with cards on a client store:
1. Put `STRIPE_SECRET_KEY` (sk_live_…) in `apps/api/.env`.
2. In the Stripe dashboard add a webhook for
   `https://<api-host>/api/payments/webhooks/stripe` with event
   `checkout.session.completed`; put its secret in `STRIPE_WEBHOOK_SECRET`.
3. Restart the API. The card option appears in checkout on the next load.

Covered by `tests/integration/payments.test.ts` (capability flag, card
rejection without Stripe, session creation, webhook settling + idempotency)
and `tests/unit/payments/stripe-webhook.test.ts` (real-SDK signature
verification: valid secret, wrong secret, tampered payload, missing header).

---

## 2. Email is logged, not delivered

`email.service.ts` connects to SMTP using `SMTP_HOST` / `SMTP_PORT`. With no
SMTP server it degrades gracefully and logs
`📧 Email would be sent to ...` instead of sending.

Order-confirmation and shipping-notification emails are wired into
`order.routes.ts` and will send as soon as real SMTP credentials are set.
For local testing, MailHog on `localhost:1025` works with the defaults.

---

## 3. ~~Settings that are stored but unused~~ — FIXED

Both previously-orphaned fields are now consumed:

| Field | State |
|---|---|
| `storeAddress` | Rendered in the storefront footer (`AppShell.tsx`, `📍 {storeAddress}`) when set |
| `googleAnalyticsId` | Injects the gtag bootstrap + `googletagmanager.com` script in the root layout (`layout.tsx`, via `buildGtagSnippet`) when set |

Both persist via `PUT /api/settings` and only take effect when the owner
actually sets them — an empty value injects/renders nothing.

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

## 5. ~~No automated tests~~ — FIXED

A full Vitest suite now exists and runs in CI (`.github/workflows/ci.yml`,
jobs `api-tests` and `web-tests`):

| Suite | Count | What it covers |
|---|---|---|
| API unit (`apps/api/tests/unit`) | 317 | middleware (auth, CSRF, error handling), variant/currency/review/download/content-block helpers, schedulers, accounting engine |
| API integration (`apps/api/tests/integration`) | 657 | every route module end-to-end against an in-memory Prisma mock (checkout, variants, options, currency, downloads, inventory, payments, attribute index, accounting, …) |
| Web lib (`apps/web`, vitest) | 350 | filter params, i18n (incl. translation-key completeness across all 5 locales), SEO, structured data, theme config, preview, page blocks, home sections |
| Web components (React Testing Library + happy-dom) | 589 | PDP, cart, admin pages, filter sidebar, theme picker, custom section, Theme Studio layout renderer + editor UI |

The **Theme Studio** adds dedicated suites on top of these (see
`docs/THEME_STUDIO.md` §6): `edit.test.ts` (grid-edit invariants + off-grid
guard), `blockUtils.test.ts` (embed parsing + model/editor/renderer
bookkeeping), `homeMapping.test.ts`, `render.test.tsx` (every one of the 33
block types renders, plus per-block assertions), `useActiveLayout.test.tsx`,
and `apps/api/tests/integration/themeStudio.test.ts` (the file API).

The Playwright browser suites in CI (`regression-ui.py` etc.) still run on top
of this; they and the Vitest suites are complementary, not duplicates.

---

## 6. ~~Product images are placeholders~~ — seeded

The six seed products ship with product photos in
`apps/web/public/images/products/` (iPhone 15 Pro ×2, MacBook Pro 14",
Classic T-Shirt, JavaScript: The Good Parts, Web Development Course), so a
fresh install looks like a store out of the box. Clients replace them via
**Admin → Products** (uploads go to MinIO/S3, not this folder). `ProductCard`
still falls back to a generated gradient tile if an image 404s.


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

Theming has its own suites since the theme-system round (see README section 9):
`verify-theme.py` (browser: every preset reaches computed styles, dark-theme
contrast guards, admin isolation) and `verify-theme-tokens.js` (no browser:
token completeness + a hardcoded-colour ratchet on the swept storefront
files). The browser suite needs the CI runner; the token suite runs anywhere.

Still missing: CD (continuous deployment) - nothing deploys automatically
because there is no hosting account yet. One-command *install* on a client
server exists: `scripts/install-store.sh` + `docs/DEPLOYMENT.md` (docker
compose or plain node). (Unit tests are done - see section 5.) Error
tracking is done: optional Sentry, no-op without a DSN (`SENTRY_DSN` in
`apps/api/.env`, `NEXT_PUBLIC_SENTRY_DSN` in the web build).

---

## 9. "Published page 404s" — two more causes, both fixed

The report came back a third time. Both remaining causes were reproduced
against the real stack (Express API + Next storefront running together):

1. **A create that omits `status` silently drafted the page.** The Page and
   BlogPost columns default to `"draft"`, and `POST /api/pages` / `POST /api/blog`
   accepted a body with no `status` — so anything other than the current admin
   bundle (a stale browser build of it, a script, a future UI regression) saved
   a page that 404'd on visit, with a 201 that looked like success. The API now
   publishes status-less creates; a draft is an explicit opt-in
   (`status: "draft"`), matching the checkbox in the admin UI. Covered by
   `verify-pages.py` § 3b.

3. **The loopback split (the third report).** With the honest error view in
   place, the report came back as the ⚠ view - proving the Next server
   process could not reach `localhost:3001` even though the browser could.
   Browsers try every address `localhost` resolves to; Node's fetch uses
   the first (`::1` on most machines). If the API's IPv6 listener is absent
   (explicit HOST, refused twin bind, old process), server-side fetches
   die while the storefront looks healthy from the browser. All server-side
   API calls now go through `lib/serverFetch.ts`, which retries across
   loopback spellings (localhost / 127.0.0.1 / [::1]) on network-level
   failures only, and logs which spelling worked. Reproduced and verified
   end to end (IPv6-only hosts file + IPv4-only API: page renders via
   fallback, with the warning naming the working address).

2. **Any backend hiccup rendered "Page not found".** `/p/<slug>` and
   `/blog/<slug>` collapsed EVERY failed API lookup (connection refused, 500,
   429) into `notFound()`. A published page therefore "disappeared" whenever
   the API wobbled, which is indistinguishable from the draft bug to the
   person staring at the 404. Now only the API's definitive 404 renders
   not-found; upstream failures render an explicit temporary-error view (and
   log the cause server-side). Note for future fixes: a thrown error from a
   streamed server component lands in the root not-found boundary in Next 14 —
   so the page CATCHES the throw and renders the error view itself rather than
   relying on `error.tsx`.

---

## 10. Schema migrations lag behind `schema.prisma`

**Status:** the drift was closed and is now guarded; a residual item
remains (see below).

The original gap (migrations stopped at `20260821090000_add_blog` while the
schema had moved on: inventory/warehouse, the variant-first-class rename,
multi-currency, downloads, review photos, `pageType`, `activeTheme`, …) was
closed by the committed `20260828000000_sync_session_schema` sync migration
plus the subsequent feature migrations. Since then the history has grown:
`20260828120000_add_product_download_limit`,
`20260829000000_add_page_blocks`, `20260829100000_add_blog_post_blocks`,
and the performance/scalability round's
`20260830000000_add_performance_indexes`,
`20260830010000_durable_storefront_forms`, `20260830020000_csrf_tokens`,
`20260830030000_variant_attribute_index`.

- **`scripts/sync-migrations.sh`** — the fixer: run on a machine with
  network access (the Prisma engine is network-fetched). It detects any
  drift, generates a closing migration, applies it, and verifies.
- **`scripts/verify-migrations.sh`** — the read-only drift guard: fails
  if the migrations and `schema.prisma` have drifted. A `api-checks`
  step for it is staged in `.github/workflows/ci.yml` (before
  `migrate deploy`), waiting on `workflows` permission to push.

**Residual item:** the four `20260830*` migrations were hand-written
(the Prisma engine is network-fetched and unavailable in the authoring
sandbox). They were verified to apply cleanly to a scratch SQLite
database in order, and follow Prisma's exact column/index naming
conventions, but the byte-exact `prisma migrate diff` check that the
drift guard performs could not be run locally. The first CI run (or a
local `scripts/verify-migrations.sh` on a networked machine) is the
authority; if it flags a mismatch, `scripts/sync-migrations.sh`
regenerates the closing migration.

---

## 11. Bulk import/export — shipped (admin)

**Status:** complete. `apps/api/src/modules/importExport/` mounted at
`/api/import-export` (admin + manager), UI at `/admin/import-export`
(linked from the Products and Categories pages and the sidebar).

* **Export** — `GET /export/:entity?format=csv|json&sample=1` for
  `products` (variants, images and SEO fields included) and `categories`
  (parent links). `sample=1` returns a one-row template.
* **Import** — `POST /preview` classifies every row (create / update /
  error) without writing; `POST /commit` re-validates the raw file and
  applies it **all-or-nothing** in one Prisma transaction. Products match
  by SKU, categories by slug then name (case-insensitive). On update,
  empty cells are ignored; `variants`/`images` columns, when present,
  replace the existing ones.
* **Limits** — 1,000,000 characters and 2,000 rows per file
  (`MAX_INPUT_CHARS` / `MAX_ROWS` in `mappers.ts`); the express body
  limit is 10 MB.
* **Not done on purpose** — images are imported as URL strings only (no
  file upload/migration), orders/customers are not importable, and the
  preview→commit gap is not a lock: if someone edits the catalogue
  between preview and commit, the commit re-validates and may classify
  differently (or roll back). All three are natural follow-ups, not bugs.

Covered by `tests/integration/importExport.test.ts` (29 tests),
`tests/unit/csv.test.ts` (parser edge cases: Excel `value, "quoted"`
cells, CRLF, blank lines) and the live CI check
`scripts/verify-import-export.py` (30 checks against a real Prisma
database in the api-checks job — the one place real transaction
rollback and unique constraints are actually exercised). The seed
creates a `General` category so the product-import default works on a
fresh install.

---

## 12. Remaining incomplete features (complete inventory)

An honest, complete list of what is **not** finished, split by kind.
Items 1–6 are the ones most likely to matter in production; 7–14 are
deliberate design choices or niche gaps.

### Likely to matter

1. **Emails are logged, not delivered.** Every transactional email
   (order confirmation, shipping notification, welcome, password reset)
   is wired and will send the moment real SMTP credentials are set —
   but until then they only reach the server log. See §2.
2. **No Postgres deployment path, yet.** The schema is provider-agnostic,
   but the committed migrations are SQLite dialect, so a Postgres install
   needs the migration history regenerated (runbook in `SCALING.md`,
   Known limit 2). Unverified here because no Postgres instance is
   available in CI or the sandbox.
3. **The CSRF guard is not mounted.** Deliberate: the API authenticates
   with Bearer JWTs (CSRF-immune) and the web client does not use the
   `x-session-id`/`x-csrf-token` flow, so mounting it would 403 the
   storefront's unauthenticated POSTs. Enabling it requires a client-side
   change (fetch `/api/csrf-token`, echo the headers) — the token store
   itself is now durable (`CsrfToken` table) so the server side is ready.
4. **Multi-instance scheduling (resolved).** The inventory and currency
   schedulers are per-process `setInterval` loops, but each tick is now
   guarded by a database-backed distributed lease (`jobs/distributedLock.ts`,
   `ScheduledJobLock` table) so only one API instance runs each job even when
   N replicas sit behind a load balancer. Lease expiry also covers a crashed
   owner. (Design note: a future operator could still move the schedules to
   cron instead.)
5. **Existing stores need a one-time attribute-index backfill.** The
   `VariantAttribute` index (which makes `/products` attribute filtering
   and facets SQL-indexed instead of O(catalog) in JS) is maintained on
   every new variant write, but pre-existing variants need
   `apps/api/prisma/backfill-variant-attributes.ts` run once after the
   `20260830030000` migration. Idempotent.
6. **Hand-written migrations need the CI drift guard to bless them.** The
   four `20260830*` migrations were verified to apply to a scratch SQLite
   DB in order, but the byte-exact `prisma migrate diff` that
   `scripts/verify-migrations.sh` performs could not be run locally (the
   Prisma engine is network-fetched). The first CI run is the authority;
   `scripts/sync-migrations.sh` is the fix if it flags a mismatch. See §10.

### Deliberate design choices / niche gaps

7. **Import/export follow-ups** (see §11): image upload/migration during
   import (URLs only today), order/customer import, and a preview→commit
   lock. All natural follow-ups, none a bug.
8. **`onSale` and `minRating` are still JS post-filters** (bounded by the
   candidate set, not the catalog) — Prisma can't express the
   `compareAtPrice > price` column comparison or the rating HAVING
   aggregate in a `findMany`. Not a practical bottleneck below ~100k
   products. See `SCALING.md`, Known limit 3.
9. **3PL integration is inbound-only.** The inventory module accepts
   signed 3PL webhooks and keeps a sync log, but there is no outbound push
   to a specific 3PL provider.
10. **Recommendations depend on opt-in analytics.** The also-bought /
    bought-together signals come from `ANALYTICS_TRACKING_ENABLED`; with
    it off (the default) they fall back to same-category popularity.
11. **Elasticsearch is optional and off by default.** Product search
    defaults to the Postgres `contains` query (`SEARCH_PROVIDER=postgres`).
    Set `SEARCH_PROVIDER=elasticsearch` to enable the Elasticsearch backend
    (Sorani-aware analyzer + fuzzy/relevance scoring), which is kept in step
    on product writes and rebuilt via `POST /api/products/search/reindex`.
    If the cluster is unreachable the API logs a warning and falls back to
    the Postgres search for the affected request, so enabling it is safe
    before the cluster is up.
12. **Socket.IO has no multi-instance adapter.** Fine single-instance; a
    `@socket.io/redis-adapter` would be needed if real-time features are
    used across several API instances.
13. **No continuous deployment.** There is a one-command install
    (`scripts/install-store.sh` + `docs/DEPLOYMENT.md`) but nothing
    auto-deploys, because there is no hosting account yet. See §8.
14. **SQLite remains the default.** Fine for the default install; the
    single-writer limit is real under sustained write-heavy traffic
    (flash sales). See §2 and `SCALING.md`.

---

## 13. Theme Studio — shipped, with honest limits

**Status:** the visual theme & per-page layout builder is complete and tested
(see `docs/THEME_STUDIO.md`). What is deliberately *not* done:

1. **Custom `sections/*.tsx` code is build-time only.** [FIXED for tokens/
   layouts] — the storefront now resolves theme tokens and per-page layouts
   from the **disk catalog at runtime** (`GET /api/themes` +
   `activeThemeConfig` on `GET /api/theme`, bridged by
   `apps/web/lib/themeRuntime.ts`), so a theme saved in the Studio, installed
   from a `.zip` (`POST /api/theme-studio/install`), or removed takes effect
   on the next page load — no web rebuild. What remains build-time is custom
   React `sections/` code: runtime-installed themes are **data-only** by
   design (uploaded code is never executed); a theme that needs custom
   sections must ship bundled with the platform. See
   `docs/THEME_DEVELOPMENT.md` §2.
2. **Home-page rich blocks render as custom/title sections.** The home page
   renders a themed layout through its home-specific section renderers, so a
   rich pre-built block (`cta`, `faq`, `steps`, `pricing`, …) placed on the
   *home* page falls back to the generic custom/title section. Rich blocks
   render fully on products, category, product detail, blog, blog post, and
   custom pages, which use `LayoutRenderer`.
3. **A themed page layout replaces the page's built-in chrome.** When an admin
   defines a layout for a page such as `/products`, that grid (not the built-in
   filter sidebar / pagination) is what renders — the admin's explicit
   composition wins. This is the intended behaviour of "full layout control",
   not a bug, but it changes the UX for pages the admin themes.
4. **No marketplace / license enforcement.** There is still no theme
   marketplace or license enforcement for `paid` themes (see README §18).
   (Admin-created and admin-installed themes DO now take effect at runtime —
   see item 1 above.)
5. **Config fields are authored in the Studio and trusted as authored.** The
   `/api/theme-studio` layer validates the theme envelope (key, semver,
   features, required fields) and strips unknown keys, but per-block `config`
   payloads are stored as authored (rich HTML is sanitised on the home path).

The model lives in `apps/web/lib/layouts/`; the file API in
`apps/api/src/modules/themeStudio/`. Every block type is covered by the
"every registered block type renders" test plus per-block unit/component
tests; the file API is covered by `apps/api/tests/integration/themeStudio.test.ts`.

The Studio's editor UI is covered by `apps/web/app/admin/theme-studio/page.test.tsx`:
drag-and-drop add, reorder/remove, per-page draft persistence (the save PUT
round-trips the edited `layouts` back to the API), and the responsive stacking
of the 3-column canvas (theme list | canvas | palette) below 900px.

The admin table pages follow one responsive rule for their wide data grids
(orders, products, variants, coupons, inventory, reviews, gift-cards, tax,
categories, accounting, …): the table wrapper is `overflow-x: auto` so a grid
that is wider than the phone viewport scrolls inside the card instead of being
clipped. The admin shell itself (sidebar) collapses to a hamburger + slide-in
overlay below 768px (see `app/admin/layout.test.tsx`).

---

## 14. Plugins — shipped, with honest limits

**Status:** the plugin system is complete and tested (see
`docs/PLUGIN_DEVELOPMENT.md`). What is deliberately *not* done:

1. **Uploaded plugins are data-only.** A plugin `.zip` can only declare
   webhook subscriptions + a config form; the platform POSTs signed webhooks
   to the admin-configured URL. Uploaded code is never executed (the
   anti-RCE posture). Plugins that need in-process logic must be **bundled**
   with the platform (`apps/api/src/modules/plugins/bundled/`).
2. **Five events, fire-and-forget, no retry queue.** `order.created`,
   `payment.settled`, `product.created`, `product.updated`,
   `customer.registered` are emitted synchronously (never blocking the
   storefront); a failed delivery is recorded in the execution log but not
   retried. A durable outbox + retry backoff is future work.
3. **No marketplace / third-party trust model.** Plugins are installed by
   an admin with the credentials to upload; there is no signature
   verification against a publisher key, no marketplace, and no per-plugin
   rate limiting (the platform rate-limits its own API).
4. **HMAC signature, not a shared platform secret.** Each install gets its
   own random secret (state file); receivers verify
   `X-Store-Webhook-Signature`. Webhook-id replay protection
   (`X-Store-Webhook-Id`) is present, but dedupe is the receiver's job.

The plugin module lives in `apps/api/src/modules/plugins/`; the admin UI in
`apps/web/app/admin/plugins/`; the pack CLI is `scripts/plugin-pack.mjs`
(`npm run plugin:pack`). Tests: `apps/api/tests/integration/plugin.test.ts`
(lifecycle + delivery), `tests/unit/plugins/plugin-schema.test.ts`,
`tests/unit/utils/zipPackage.test.ts` (shared hostile-zip extractor), and
`apps/web/app/admin/plugins/page.test.tsx` (admin UI contract).

---

## 15. Accounting — shipped

A lightweight, file-based double-entry bookkeeping module (see
`docs/ACCOUNTING.md`). The five original gaps are now closed:

1. **Auto-posting at checkout — DONE.** `ACCOUNTING_AUTO_POST=true` posts a sale
   entry when a payment is settled (Stripe webhook or staff bank-transfer/COD)
   and a refund entry on refund; idempotent and best-effort so a posting hiccup
   never fails a payment. Manual **Post from Order** (suggest → post) remains for
   review-first workflows.
2. **Multi-currency — DONE.** Every entry carries an ISO currency and reports /
   the ledger filter by `?currency=` — a per-currency ledger model (no FX
   conversion).
3. **Append-only entries — DONE, by design.** Entries are never edited/deleted;
   corrections use **reverse** or **void** (`POST /entries/:id/void`), both
   keeping the audit trail.
4. **In-process persistence — DONE.** Writes are atomic (tmp + rename) and every
   read/modify/write cycle takes a cross-process filesystem lock with staleness
   recovery, so multiple API instances sharing a data directory are safe.
5. **No fiscal-year periods — DONE.** `POST /entries/close-year/:year` moves net
   income to retained earnings via a `closing` entry that the income statement
   ignores but the balance sheet includes.

Remaining honest limits: multi-currency is per-ledger (no FX conversion), closing
a year is permanent (adjust via normal entries in that year), auto-posting is
opt-in via the env flag, and the cross-process lock needs the instances to share
the same data directory.

The pure engine lives in `apps/api/src/modules/accounting/accountingEngine.ts`
and is unit-tested (`tests/unit/accounting/accountingEngine.test.ts`); the file
API and reports are covered by `apps/api/tests/integration/accounting.test.ts`
and the admin UI by `apps/web/app/admin/accounting/page.test.tsx`.

## 16. Payment gateway refunds — wired (except IDPay)

Staff refunds (`POST /api/payments/refund`) now call the gateway's real refund
API **when the order was paid through a gateway that exposes one**, and only
then create the local `Payment` row, update the order, and post the accounting
entry. Refunds are **never** recorded locally unless the gateway confirms the
money moved — otherwise the route returns a 4xx/5xx and leaves the order
`completed`.

**Partial refunds are supported.** Omit `amount` to refund the full remaining
balance; pass a smaller `amount` to refund in parts. The order's payment status
becomes `partially_refunded` after a partial refund (fulfilment status
unchanged) and `refunded` once the balance is fully returned. Over-refunds and
second refunds of an already-fully-refunded order are rejected (400). The admin
order page has a refund-amount field that defaults to the full remaining
balance.

| Gateway   | Refund via API? | Endpoint / call                                  |
|-----------|-----------------|--------------------------------------------------|
| Stripe    | ✅              | `stripe.refunds.create({ payment_intent })`      |
| PayPal    | ✅              | `POST /v2/payments/captures/:id/refund`          |
| ZainCash  | ✅              | `POST .../transaction/reverse` (`reverse:write`) |
| Zarinpal  | ✅              | `POST /pg/v4/payment/refund.json`                |
| FIB       | ✅              | `POST .../payments/:id/refund` (HTTP 202)        |
| IDPay     | ❌              | IDPay exposes no API refund — refund in the IDPay panel |

The gateway refund adapters are unit-tested with a stubbed HTTP layer
(`tests/unit/payments/gateways.test.ts`), and the refund route is covered by
`tests/integration/payments.test.ts` (refuses to mark a gateway order refunded
when the gateway is disabled, and refuses to refund IDPay, which has no API
refund). Only IDPay still requires a manual refund in its panel.

By contrast, the customer **retry-payment** path (abandoned gateway page) is
fully wired: `POST /api/orders/:id/pay` re-runs the hosted checkout session and
the account order page offers **Pay now**.

---

## 17. Order totals — server-authoritative (review pass)

Order placement no longer trusts any amount the client sends. The subtotal
is recomputed from the DB prices of the line items, tax and shipping are
recomputed with the same services the checkout's advisory `/calculate`
endpoints use (extracted into `tax.service.ts` / `shipping.service.ts`),
and the discount is re-derived from the coupon's rules (`coupon.service.ts`,
shared with `/coupons/validate`). A request that claims a $1 total for a $20
cart gets the $20 order; a coupon that is invalid, expired, inactive, or
over its usage limit fails the order (400) instead of being silently
recorded; a shipping method that does not match the destination also fails
the order. `free_shipping` coupons zero the shipping cost server-side.

Two deliberate edge notes:

1. **Coupon per-customer limits are not enforceable today.** The Coupon
   model has only a global `usageLimit`/`usedCount` — there is no
   `maxUsesPerCustomer` column and no `Order.couponId` link to count
   against, so "one use per customer" coupons need a schema migration
   (add `couponId` to `Order` + a per-customer count) before they can be
   enforced at order time.
2. **Advisory endpoints remain advisory.** `/tax/calculate` and
   `/shipping/calculate` still exist for the checkout display; the
   numbers they return are what order placement recomputes, so the two
   can never drift — but nothing stops a client from skipping them.

Also from the review pass: `GET /api/newsletter/subscribers` and
`GET /api/contact` are now admin/manager-only (they leaked subscriber
emails and contact-message PII), upload `folder`/`id` path parameters are
validated against the known buckets (path traversal), the rich-text
sanitizer entity-decodes numeric character references before scheme checks
(`java&#x73;cript:` bypass), CSV exports neutralise spreadsheet formula
injection, order line items are shape-validated (quantity must be an
integer >= 1 — the zero-quantity free-downloads hole is closed) and list
endpoints clamp `page`/`limit` (no more full-table scans or negative-skip
500s). Emails are hardened against header injection (CR/LF stripped from
every subject at the send boundary and in subject templates) and HTML
injection (customer/product names escaped in bodies and HTML templates).
Auth now rejects refresh tokens presented as access tokens (a long-lived
refresh token could previously be used directly in `Authorization: Bearer`,
bypassing refresh rotation and replay detection). Analytics `days`
windows and the reviews admin queue are clamped (NaN/negative values
could 500 or scan full ranges). Admin link fields (menu item URLs, banner
link URLs) reject `javascript:`/`data:`/`vbscript:`/`file:` schemes —
they render straight into `<a href>` in storefront themes, so a stored
script URL would execute in every visitor's browser. Content
translations of HTML-rendered fields (page/post bodies, product/category
descriptions) are now sanitized on write — they previously bypassed the
base-content sanitizers and rendered with dangerouslySetInnerHTML.
Product descriptions now use the entity-decoding sanitizer
(sanitizeRichText) instead of the weaker regex one — `java&#x73;cript:`
hrefs used to survive the old regexes and execute after the browser
decoded the entity. Theme custom CSS now blocks `</style>` breakouts
(`</style><img onerror=...>` used to pass the old DANGEROUS_CSS regex
and become live HTML on every storefront page; legacy rows are scrubbed
on read). Review photo URLs reject scriptable/data: schemes. The
inventory low-stock `threshold` query param is clamped (`-5` used to be
a Prisma validation error, `1e999` parsed to Infinity). Guest stock-alert
subscriptions are deduped by email, not by the shared 'anonymous' userId
(a second guest with a different email could never subscribe). The
advisory shipping/calculate endpoint tolerates hostile numeric payloads
(NaN/Infinity/negative numbers previously poisoned the rate math — the
authoritative order-placement path already recomputed rates server-side,
so this only affects the checkout display). The advisory tax/calculate
endpoint gets the same defensive parsing, including hostile item
price/quantity rows. The MinIO storage routes are hardened: presigned
URLs are admin-only (any authenticated user could previously mint a
7-day URL for ANY bucket object, bypassing the private-prefix gating),
upload folder prefixes are allowlisted, and presigned expiry is clamped
to [1 minute, 7 days]. The coupon `POST /:id/apply` endpoint is removed:
it let any authenticated customer increment ANY coupon's usedCount
without checks (public /validate leaks the id), so it could be hammered
to burn a coupon's usage limit — usage is only counted at order
placement now. Wishlist move-to-cart validates quantity (integer 1..99999)
and refuses to move archived/deleted products (dead wishlist rows
self-clean) — a plain `quantity || 1` used to accept -5/1.5/'abc'/1e9
straight into the cart. The tax summary endpoint parses its startDate/
endDate query params strictly (Invalid Date used to 500 on the Prisma
range query).
Accounting: closing a fiscal year now zeroes contra (negative-balance)
revenue/expense accounts too (they used to bleed into next year's P&L),
and reversing a voided or closing journal entry is refused (a reversal
of a voided entry posted a live offset that distorted the books).
Storefront/account pages read the localStorage 'user' blob through a
safe helper — corrupt storage could white-screen checkout, the admin
profile page, and break the stock-alert handler.
