# Online Store — Self-hosted E-commerce Platform

**پلاتفۆرمی بازرگانی میزبانی خۆیی —** A full-featured,
self-hosted e-commerce platform. Built for small and medium businesses —
install it on your own server, own your data, extend it freely.

> **Documentation languages / Zimanên belgeyan / زوانەکانی بەڵگەنووسین:**
> [🇬🇧 English (this file)](README.md) ·
> [🏴 Kurdî (Soranî)](docs/README-ku.md) ·
> [🇮🇷 فارسی](docs/README-fa.md) ·
> [🇸🇦 العربية](docs/README-ar.md)

---

## 1. What this is

A complete online store in a single repository (npm monorepo):

- `apps/api` — Express.js REST API (TypeScript, Prisma ORM)
- `apps/web` — Next.js 14 storefront + admin panel (App Router, TypeScript)

One command installs it on a client server (`./scripts/install-store.sh`),
one command runs it in development (`npm run dev`), and one file describes
every configuration knob (`.env.example`).

**Kurdish-first by design**: the storefront ships in English, Kurdish
(Sorani), Arabic, Persian and Turkish with full RTL support; admin and docs
follow the same languages.

## 2. Features

### Storefront (customer-facing)

- Products: **physical and digital** (downloads with per-order tokens,
  download limits and expiry), variants, typed options (color/size…),
  image galleries, stock, backorders, restock alerts
- Category browsing (nested), search, faceted filtering, comparison,
  recently-viewed
- Cart, wishlist, addresses, multi-step checkout
- Payments: **cash on delivery and bank transfer by default** (offline
  flow, settled by staff); **Stripe card payment is opt-in** per store
- Orders: tracking, receipts, order history, digital downloads
- Reviews with photos, coupons, gift cards, deals
- Pages & blog: block-based CMS (headings, images, columns, callouts,
  quotes, galleries, buttons) with draft/publish and Unicode slugs
- Storefront i18n: en / ku / ar / fa / tr with RTL; currency picker and
  multi-currency support
- SEO: server-rendered metadata, JSON-LD structured data (Product,
  Breadcrumb, WebSite, Article), sitemap, robots.txt, Open Graph
- Home page builder (sections, banners, gallery)

### Admin panel (`/admin`)

Dashboard, Products, Variants, Categories, Inventory (stock, warehouses,
transfers, reservations, stock takes, reorder rules, channel inventory),
Orders, Customers, Reviews, Coupons, Gift cards, Shipping (zones &
methods), Tax, Pages, Blog, **Appearance (theme picker + design tokens)**,
**Theme Studio (visual theme & per-page layout builder — see §9.1)**,
Banners & gallery, Menus, **Analytics**, **Import / Export**, **Accounting
(double-entry ledger, chart of accounts & reports — see
[docs/ACCOUNTING.md](docs/ACCOUNTING.md))**, Settings, Users (role-based:
admin, manager, customer).

### Platform

- Bulk **import/export** for products and categories (CSV or JSON,
  preview, all-or-nothing commit) — see §10
- **Analytics & recommendations** (opt-in, privacy-first) — see §11
- **Theme system**: 5 bundled themes, scaffold tool, live preview,
  per-store selection, runtime install/edit/remove — see §9
- **Plugins**: bundled in-process code plugins + data-only webhook plugins
  (install/config/test/uninstall at runtime, HMAC-signed delivery) — see
  §9.2
- Rate limiting, Zod input validation, JWT auth (access + refresh),
  bcrypt passwords, role-based access control
- Optional services degrade gracefully: no Redis → no cache; no MinIO →
  local-disk uploads; no SMTP → emails written to the log

## 3. Tech stack

| Layer | Technology |
|---|---|
| Storefront | Next.js 14 (App Router), React 18, TypeScript |
| Styling | CSS variables + design tokens (per theme), no framework lock-in |
| API | Express.js, TypeScript |
| ORM / DB | Prisma — **SQLite by default** (zero-install); PostgreSQL supported |
| Cache | Redis (optional) |
| Files | MinIO / S3-compatible (optional) → local disk fallback |
| Payments | Stripe (optional); offline COD / bank transfer by default |
| Real-time | Socket.IO |
| Email | SMTP (any provider); MailHog for local dev |
| Tests | Vitest (unit + integration), Playwright (CI browser suites) |
| Deploy | Docker / Docker Compose, one-command installer |

## 4. Quick start (development)

**Prerequisites:** Node.js 18+, npm 9+. No database server needed
(SQLite file is created for you).

```bash
git clone <repository-url> && cd <repository>
npm install

# Database: create the SQLite file + schema, then seed a demo catalog
npm run db:deploy        # apps/api/prisma/dev.db
npm run db:seed

# Run API (:3001) + storefront (:3000) together
npm run dev
```

> **Fresh-DB note:** `npm run db:deploy` applies the committed migrations.
> If a local DB misbehaves after a schema change, `npm run db:reset`
> (drop + recreate + seed) is the reliable path. See
> [KNOWN_GAPS.md](KNOWN_GAPS.md) §9 (migration history).

### Access points

| Service | URL |
|---|---|
| Storefront | http://localhost:3000 |
| API | http://localhost:3001 (`/health` for the health check) |
| Admin | http://localhost:3000/admin |
| Theme previews | http://localhost:3000/preview/default (…, /minimal, /bold, /dawnlight, /pulse) |

### Seeded accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@store.com` | `admin123` |
| Customer | `customer@example.com` | `customer123` |

The seed also creates a demo catalog (5 categories incl. `General`,
5 products, reviews, coupons, shipping methods, banners) and 50
synthetic `UserEvent` rows so the analytics dashboard shows sample
data — demo rows, not collected visitor data.

### Running without Docker

Everything works bare-metal. The `docker/` compose files exist for the
**optional** services (Redis, MinIO, MailHog, PostgreSQL if you switch):

```bash
npm run docker:up      # start optional services
npm run docker:down    # stop them
```

## 5. Configuration

All settings live in `apps/api/.env` (template: `.env.example` at the
repo root). Highlights:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:./dev.db` (SQLite default). Must match `provider` in `prisma/schema.prisma` — a mismatch is Prisma error P1012, a config mistake, not a broken install |
| `JWT_SECRET` | 32+ chars; the installer generates a random one |
| `REDIS_URL` | Optional. Absent → caching silently disabled |
| `MINIO_*` | Optional. Absent → uploads go to local disk |
| `SMTP_*` / `EMAIL_FROM` | Optional. Absent → emails are written to the log |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Optional. Empty → card payment hidden, offline flow only |
| `FRONTEND_URL` | Absolute store URL (links in emails, redirects) |
| `ANALYTICS_TRACKING_ENABLED` | **`false` (default).** `true` turns on behavioural event collection — see §11 and the privacy page |
| `REVIEWS_AUTO_APPROVE` | `false` (default). `true` publishes reviews without moderation |
| `PAYMENTS_ALLOW_MOCK` | `false` (default). `true` lets any customer self-settle — **demo only** |
| `LOG_LEVEL` / `LOG_FILE` | `info`/`logs/app.log` defaults |

### Switching to PostgreSQL (optional)

Nothing to edit — the PostgreSQL schema and migrations are already
committed (`prisma/schema.postgres.prisma`, `prisma/migrations-postgres`).

1. Point `DATABASE_URL` at your instance, e.g.
   `postgresql://store_user:store_password@localhost:5432/store_db`
   (the dev compose file already provides one with those credentials)
2. `cd apps/api && npx prisma migrate deploy --schema prisma/schema.postgres.prisma`
3. `npx prisma generate --schema prisma/schema.postgres.prisma`

Under Docker this is automatic: the entrypoint detects a `postgres://` URL
and selects that schema itself.

After changing `schema.prisma`, regenerate the PostgreSQL variant with
`python3 scripts/generate-postgres-baseline.py --write` — a CI test fails if
the two drift apart.

The code is provider-neutral: it avoids SQLite-incompatible filters
(`mode: 'insensitive'`) by doing small in-memory lookups instead, so
nothing else changes. For production, keep regular `pg_dump` backups of
the database.

## 6. Project structure

```
├── apps/
│   ├── api/
│   │   ├── prisma/            # schema.prisma, migrations, seed.ts
│   │   └── src/
│   │       ├── config/        # environment, database, redis, minio, stripe, sentry
│   │       ├── middleware/    # auth (JWT + RBAC), validation (Zod), errors
│   │       ├── modules/       # one directory per feature:
│   │       │   #   auth, products, variant, orders, payments, analytics,
│   │       │   #   recommendations, inventory, categories, users, reviews,
│   │       │   #   coupons, gift-cards, shipping, tax, pages, blog, banners,
│   │       │   #   menus, newsletter, pages, settings, theme, themeStudio, accounting,
│   │       │   #   importExport, downloads, currency, storage, …
│   │       ├── services/      # email, payment helpers
│   │       ├── utils/         # logger, csv, content blocks
│   │       ├── app.ts         # express app, routes, limits
│   │       └── server.ts      # entry point, graceful shutdown
│   │   └── tests/             # unit + integration (mock-Prisma, no DB needed)
│   └── web/
│       ├── app/               # Next.js App Router: storefront + /admin
│       │   └── admin/theme-studio/   # the Theme Studio visual builder (see §9.1)
│       ├── themes/            # one directory per theme (see §9)
│       ├── components/        # shared UI (incl. PageLayoutView, StaticLayoutRenderer)
│       ├── lib/
│       │   ├── layouts/       # theme-studio data model, defaults, edit helpers,
│       │   │                  # block renderers, useActiveLayout, serverLayout
│       │   └── …              # api client, http, i18n, theme, tracking, seo, …
│       └── public/themes/     # theme preview images
├── docker/                    # dev + prod compose files
├── scripts/                   # setup, install, verify-* (CI live checks),
│                              # scaffold-theme, regression suites
├── docs/                      # deployment guide + translated READMEs
├── .env.example               # the configuration reference
└── KNOWN_GAPS.md              # honest list of what's unfinished
```

## 7. Architecture overview

**Request flow (storefront):** Browser → Next.js (server components fetch
the API at build/request time for SEO-critical pages; client components
fetch for interactivity) → Express middleware pipeline
(rate limit → JSON parse → auth → Zod validation) → module route →
service → Prisma → SQLite/Postgres.

**API → browser proxy:** `next.config.js` rewrites `/api/*` → API and
`/uploads/*` → MinIO, so a same-origin deployment needs no CORS
configuration and works even when the API host isn't browser-reachable.

**Auth:** `POST /auth/login` returns short-lived **access** + **refresh**
JWTs. The storefront keeps the token in `localStorage` (no tracking
cookies — see §11). Roles: `admin` (everything), `manager` (catalog &
orders, no user management), `customer`.

**Data model (core):** Users, Products (with Variants, ProductImages,
typed Options/OptionValues), Categories (self-referencing tree), Orders +
OrderItems, Payments, Reviews (+ photos), Cart, Wishlist, Addresses,
Coupons, GiftCards, ShippingZones/Methods, TaxClasses/Rates,
Warehouses + inventory models, Pages/BlogPosts (content blocks), Banners,
Menus, StoreSettings, ThemeSettings, UserEvents (analytics).

**Resilience rules used throughout:** optional services (Redis/MinIO/SMTP)
degrade per-feature (the feature is simply off) but never crash the request; analytics tracking
never fails a request; admin writes are validated before touching the DB.

## 8. Storefront guide (merchant operations)

- **Add a product**: Admin → Products → *+ Add Product*. Fill name, SKU,
  price, category, images; add variants or typed options if needed; digital
  products get a download URL + limits. Status `active` publishes it.
- **Sell without a card gateway**: checkout offers Cash on Delivery and
  Bank Transfer. Orders arrive `paymentStatus: pending`; staff settle them
  from Admin → Orders. (Never enable `PAYMENTS_ALLOW_MOCK` on a public
  store.)
- **Enable Stripe**: set the two keys in `.env`, add the
  `checkout.session.completed` webhook in your Stripe dashboard, restart.
  The card option appears automatically.
- **Coupons & gift cards**: Admin → Coupons / Gift cards. Both work at
  checkout; gift cards generate claimable codes.
- **Content**: Admin → Pages / Blog — block-based editor (add heading,
  image, columns, callout, quote, gallery, button blocks), draft →
  publish. Slugs are Unicode-safe (Kurdish/Arabic titles work).
- **Home page**: Admin → Dashboard sections + Banners & gallery.

## 9. Themes

A **theme** is a directory under `apps/web/themes/<key>/`:

- `theme.json` — validated by a strict Zod schema: identity (key, name,
  author, semver), `features` (`rtl`, `darkMode`, `paid`), `tokens`
  (colors, fonts, radius, container width, card shadow, products-per-row,
  section toggles like `showTrustBar`), and optional per-page `layouts`
  (Theme Studio grids)
- `sections/*.tsx` — component overrides for home-page sections
  (`hero`, `featured`, `categories`). Build-time only: these are compiled
  into the web bundle for **bundled** themes.

**Two tiers, one runtime.** Bundled themes ship with the platform (5:
`default`, `minimal`, `bold`, `dawnlight`, `pulse`). Admin-installed themes
arrive as a developer-packed `.zip` and are **data-only** (tokens +
layouts, rendered with the platform's built-in sections and the 33 Theme
Studio block types) — no rebuild, no deploy. The API serves the on-disk
catalog (`GET /api/themes`) and the storefront resolves tokens/layouts at
runtime, so **install / edit / remove take effect immediately**, for both
tiers.

**Developer workflow** — full guide in
**[docs/THEME_DEVELOPMENT.md](docs/THEME_DEVELOPMENT.md)**:

```bash
npm run theme:create -- solar --name "Solar"   # scaffold a bundled theme
npm run theme:pack -- solar                    # validate + pack an installable .zip
```

The scaffold performs every registration touch point (theme.json + three
contract-compliant RTL-safe section stubs, `.bundled` platform marker,
registry entry, section component map, RTL test matrix, theme-picker test
pin). A malformed `theme.json` fails the **build** with a readable path; a
forgotten RTL registration fails the test suite. Preview at
`/preview/solar`; activate per store in **Admin → Appearance**, where an
admin can also **Install** a `.zip` and **Remove** an installed theme
(bundled themes and the `default` fallback are protected; removing the
active theme switches the store back to `default`).
Per-store token overrides layer on top of the active theme.

**Limits (honest):** `paid: true` is metadata only (no license check or
marketplace yet); `darkMode` is a capability badge only; custom
`sections/*.tsx` code is a build-time feature — runtime-installed themes
are deliberately data-only (uploaded code is never executed).

### 9.1 Theme Studio — visual theme & layout builder

The **Theme Studio** (`/admin/theme-studio`, linked from Admin → Appearance)
lets an admin **create** a theme visually and take full **grid control over
every storefront page**: drag blocks from a palette onto a column grid, set each
block's column/row start & span, reorder, hide, and click-to-edit its config —
with a live preview rendered by the same component the storefront uses.

- Themes are **file-based**: the Studio writes a `theme.json` (tokens +
  per-page `layouts`) into the themes dir via the `/api/theme-studio`
  API. Edits are served at **runtime** (the storefront reads the disk
  catalog on every load), so a saved change shows up on the next page
  load — no rebuild.
- Three groups of blocks: **marketing** (hero…newsletter), **rich pre-built**
  (cta, video, image, textImage, divider, faq, steps, logoStrip, pricing,
  quote, iconsGrid), and **page-native** (productDetail, productList,
  categoryGrid, blogList, blogPostBody, pageContent — they render a page's real
  content).
- Every page opts in through one shared renderer (`LayoutRenderer`) plus a
  client hook (`useActiveLayout`) and a server resolver
  (`getServerPageLayout`) for SEO pages. A page with **no** layout keeps its
  built-in content — nothing changes until an admin ships a layout.

Full architecture, data model, block list, API reference, extension guide and
honest limitations: **[docs/THEME_STUDIO.md](docs/THEME_STUDIO.md)**.

### 9.2 Plugins — events, webhooks and bundled code

A **plugin** subscribes to store events and reacts to them. Two tiers:

- **Bundled plugins** are reviewed code shipped with the platform
  (`apps/api/src/modules/plugins/bundled/`), registered through a static
  import map; their handlers run **in-process**. Example: `order-logger`,
  which logs every order/payment event.
- **Installed plugins** are admin-uploaded `.zip` packages that are
  **data-only by design**: a `plugin.json` manifest (id, name, semver,
  author, `kind: "webhook"`, a `hooks` subset, a tiny `configSchema` DSL)
  plus config state. They are never executed — the platform delivers each
  subscribed event to the admin-configured URL as a signed webhook
  (`X-Store-Webhook-Signature: sha256=<HMAC>` over the raw body, with the
  plugin's per-install secret; `X-Store-Webhook-Id` as a fallback). This is
  the anti-RCE posture: uploaded code cannot run, only webhooks are sent.

**Events (v1):** `order.created`, `payment.settled`, `product.created`,
`product.updated`, `customer.registered`. Emission is fire-and-forget —
`emit()` never throws or blocks the storefront. Every delivery attempt is
recorded in `state/<id>.log.jsonl` (capped at 512 KB), visible in
**Admin → Plugins** along with the config form, an enable/disable toggle and
a **Test** button that fires a sample payload through the real pipeline.

**Developer workflow** — full guide in
**[docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md)**:

```bash
npm run plugin:pack -- my-plugin     # validate the manifest + zip it
```

Install the resulting `.zip` in **Admin → Plugins**; a plugin must be
disabled before it can be uninstalled. Storage is file-based
(`PLUGINS_DIR`, default `apps/api/plugins`: `packages/<id>/`,
`state/<id>.json`); the production compose mounts a `plugins_data` volume.
The install gate validates the manifest end-to-end (id/version/hooks/
permissions/configSchema) and the shared zip extractor rejects zip-slip,
symlink and bomb packages — the same hardening the theme installer uses.
Bundled ids can never be overwritten or uninstalled.

## 10. Bulk import / export

Admin + manager only. UI at `/admin/import-export`; API at
`/api/import-export`.

- **Export** — `GET /export/:entity?format=csv|json&sample=1` for
  `products` (incl. variants, images, SEO fields) and `categories`
  (incl. parent links). `sample=1` returns a one-row template.
- **Preview** — `POST /preview {entity, format, text}`: parse + validate,
  classify every row as **create / update / error**, writes nothing.
- **Commit** — `POST /commit`: re-validates the raw file and applies it
  **all-or-nothing** in one transaction. Any row error → nothing lands.

Semantics: products match by **SKU** (new → create, existing → update,
empty cells ignored); categories match by **slug, then name**
(case-insensitive); `variants`/`images` columns, when present, replace the
existing ones. Products without a `category` column land in the seeded
`General` category. Limits: 1,000,000 characters / 2,000 rows per file.

Verified by 29 integration tests, 14 CSV-parser unit tests, 12 admin-page
component tests, and the live CI script `scripts/verify-import-export.py`.

## 11. Analytics, recommendations & privacy

**Off by default.** The whole behavioural pipeline activates only when the
API runs with `ANALYTICS_TRACKING_ENABLED=true`; with the flag unset the
tracking endpoints 404 and **nothing is collected** (the storefront's
event requests are silently discarded).

When enabled:

- **Events**: `view`, `add_to_cart`, `wishlist` from the storefront
  (session id from `sessionStorage` — never a cookie; the bearer token is
  attached only when signed in, which links events to an account);
  `search` and `purchase` are recorded server-side (search endpoint,
  order creation). Each event stores event type, product/category,
  search text, timestamp, user agent and client IP.
- **Consumers**: home-page **Trending** (event-driven), admin
  **Store Activity** (today's counters, top searches 30d, trending 7d),
  per-product **conversion rates** (view → cart → purchase), user
  behavior, and the **recommendation engine** (also-bought learns real
  co-purchases; history-based recs from views).
- **What we never do**: no third-party analytics by default (Google
  Analytics only if the store owner configures a property id), no selling
  or sharing data, no tracking cookies — login state and preferences live
  in the browser's `localStorage`.
- **Server logs** always carry the client IP (standard web logging);
  search terms appear in logs only at `LOG_LEVEL=debug`.

The `/privacy` page documents all of this and carries a maintenance note:
if the behaviour changes, the page changes in the same commit.

## 12. API overview

REST, JSON, JWT-protected where needed. Base: `/api`.

- **Auth**: register, login, refresh, logout, me, forgot/reset password
- **Products**: list (faceted filter + search), featured, `search`, by
  id/slug, related, CRUD (admin), variants & options
- **Orders**: list, create, status updates (admin, manager), cancel, receipts,
  tracking, per-item download tokens
- **Payments**: process (staff settlement), Stripe Checkout + webhook
- **Users / Customers**: CRUD (admin), per-user orders & wishlist
- **Catalog ops**: categories (tree), inventory & warehouses, coupons,
  gift cards, shipping, tax
- **CMS**: pages, blog, banners, menus, home sections, settings, theme
- **Theme Studio**: `GET/PUT/DELETE /theme-studio/themes/:key` (admin/manager)
  — file-based create/edit/delete of `theme.json` themes incl. per-page layouts
  (see §9.1)
- **Accounting**: `GET/POST/PUT/DELETE /accounting/accounts`, `GET/POST
  /accounting/entries` (multi-currency), `POST /accounting/entries/:id/void`,
  `POST /accounting/entries/close-year/:year`, `GET /accounting/ledger/:accountId`
  and `/accounting/reports/{balances,trial-balance,income-statement,balance-sheet}`
  — file-based double-entry bookkeeping, auto-posted at checkout when
  `ACCOUNTING_AUTO_POST=true` (see [docs/ACCOUNTING.md](docs/ACCOUNTING.md))
- **Store ops**: `import-export` (§10), `analytics` (§11),
  `recommendations` (trending, new-arrivals, also-bought, bought-together,
  history, personalized), `downloads`, `currency`, `storage` (uploads)
- **Health**: `GET /health`
- **Developer API**: `GET /developers` serves the machine-readable manifest of
  every documented public endpoint; `GET /developers/bootstrap` returns
  settings + home sections (with their design config, incl. the hero options)
  + banners + categories + header/footer menus in one call. The live,
  browser-based reference — endpoint catalog with “try it”, the hero design
  contract, and the theme section contract — is served by the storefront at
  **`/developers`** (point your browser at your store's `/developers` page).

Authoritative source: `apps/api/src/modules/*/…routes.ts` (every route is
unit/integration-tested or covered by a live `verify-*.py` script). The public
endpoint list is generated from `apps/api/src/modules/developers/publicEndpoints.ts`.

## 13. Database

**Default: SQLite** (`apps/api/prisma/dev.db`) — zero-install; the file is
created by `npm run db:deploy`. PostgreSQL is fully supported (see §5).

```bash
npm run db:deploy     # apply migrations (migrate deploy)
npm run db:migrate    # dev: create/apply a migration
npm run db:seed       # demo catalog + accounts
npm run db:reset      # drop, recreate, seed
npm run db:studio     # Prisma Studio GUI
npm run db:generate   # regenerate the client after schema edits
```

Known caveat: the committed migration set lags some schema changes
(honest status in [KNOWN_GAPS.md](KNOWN_GAPS.md) §9) — for a fresh local
DB, `db:reset`/`prisma db push` + seed is the reliable path.

## 14. Testing & CI

| Suite | Command | What it needs |
|---|---|---|
| API unit | `npm run test:api:unit` | none (Vitest) |
| API integration | `npm run test:api:integration` | none — in-memory **mock Prisma**, no database |
| Web lib | `npm run test:web:lib` | none (Vitest + happy-dom) |
| Web components | `npm run test:web:components` | none (RTL + happy-dom) |
| Live regression (API) | `bash scripts/regression.sh` | running API + seeded DB |
| Live regression (browser) | CI `ui-checks` | API + built storefront, Playwright |
| Feature verifiers | `python3 scripts/verify-*.py` | running API (+ storefront for browser ones) |

CI (`.github/workflows/ci.yml`) runs two parallel jobs on every push to
`main`: **api-checks** — env-template check, migrations, seed, start
API, `regression.sh`, `audit-silent-writes.py`, `verify-commerce.py`
and `verify-import-export.py` — and **ui-checks** — `next build`, start
API + storefront, then the Playwright suites: page sweep, home builder,
banners, gallery, 404 status codes, user privilege guards, dashboard
figures, pages + sidebar, blog, sidebar rail geometry, Unicode slugs.

## 15. Deployment

**Client install (recommended):** on a Docker host —

```bash
git clone <repo> /opt/store && cd /opt/store
./scripts/install-store.sh     # compose (prod profile) + seed, one command
```

The installer generates fresh random secrets (`JWT_SECRET`,
`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`, `POSTGRES_PASSWORD`), builds
`docker-compose.prod.yml` (api + web + redis + minio, plus mailhog under the
`mail` profile), converges the DB on first boot and seeds through the API
container.

The Docker stack runs on **PostgreSQL** (data on the `postgres_data`
volume). Development and CI still run on **SQLite** — `scripts/entrypoint-api.sh`
reads `DATABASE_URL` and selects the matching schema at runtime, so the same
image serves either.

Because the committed SQLite history cannot be replayed on PostgreSQL (it uses
PRAGMA table rebuilds and a `randomblob()` backfill), PostgreSQL gets a single
generated baseline in `prisma/migrations-postgres`, alongside a generated
`prisma/schema.postgres.prisma`. Both come from `schema.prisma` via
`python3 scripts/generate-postgres-baseline.py --write`; regenerate them after
any schema change, or `postgresBaseline.test.ts` fails.
Full details: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (Mode A Docker,
Mode B bare-metal).

**Manual:** `npm run build && npm run start` (or the Dockerfiles
`Dockerfile.api` / `Dockerfile.web`). Put the store behind TLS; set
`FRONTEND_URL`, `CORS_ORIGIN`, SMTP and (optionally) Stripe in
`apps/api/.env` before go-live.

## 16. Troubleshooting (condensed)

| Symptom | Cause & fix |
|---|---|
| `the URL must start with the protocol 'file:'` (P1012) | `DATABASE_URL` disagrees with the schema `provider` (sqlite needs `file:`). Align them — it's a config mismatch, not a broken install |
| Store works but "Page not found" on a published page | Only a **definitive API 404** renders not-found; API outages render an explicit temporary-error view (fail-open, by design) |
| PDP 500 at request time | Check `og:type` — Next.js rejects `"product"`; the code uses the allowed values |
| Admin page renders empty data | API not running, or `NEXT_PUBLIC_API_URL` points at a host the browser can't reach — the web app proxies `/api` same-origin (see §7) |
| Card option missing at checkout | Stripe keys not set (or webhook missing) — expected: the store falls back to the offline flow |
| Emails "not sent" | No SMTP configured → they're written to the log (check `LOG_FILE`). Use MailHog locally |
| Stale data after a schema change | `npm run db:reset` locally; `scripts/sync-migrations.sh` for the migration set |

The full history of fixes lives in git; the currently-known gaps live in
[KNOWN_GAPS.md](KNOWN_GAPS.md).

## 17. Known gaps (pointer)

The honest, maintained list of what is **not** finished — migrations lag,
email is logged not delivered without SMTP, paid themes have no license
check yet, no dark-mode toggle, no search click-through analytics, no
CDN — is in **[KNOWN_GAPS.md](KNOWN_GAPS.md)**. Everything there is
deliberate and documented.

## 18. Roadmap (themes & SaaS)

From the platform plan: finish the theme **marketplace** (marketing page,
Gumroad/Lemon Squeezy checkout, license-key enforcement for `paid`
themes), dark mode, and continuous deployment. Details in git history
(`docs/THEME_SYSTEM_PLAN.md` was merged into §9).

## 19. Contributing

1. Fork the repo, create a feature branch
2. Run the test suites (§14) — keep them green
3. If you change observable behaviour (privacy, tracking, deployment),
   update this doc **and** the matching `/privacy`/`/terms` pages in the
   same commit
4. Commit → push → pull request

## 20. License

The repository does not yet ship a `LICENSE` file — treat it as
all-rights-reserved until a license is chosen by the maintainer.
