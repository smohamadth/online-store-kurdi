# Online Store — Self-hosted E-commerce Platform

**Platform karbaziyar ya xerikariya înternetî ya xwe-xweşker.** A full-featured,
self-hosted e-commerce platform. Built for small and medium businesses —
install it on your own server, own your data, extend it freely.

> **Documentation languages / Zimanê belgeyên / زوانەکانی بەڵگەنووسین:**
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
(Sorani), Arabic and Turkish with full RTL support; admin and docs follow
the same languages.

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
- Storefront i18n: en / ku / ar / tr with RTL; currency picker and
  multi-currency support
- SEO: server-rendered metadata, JSON-LD structured data (Product,
  Breadcrumb, WebSite, Article), sitemap, robots.txt, Open Graph
- Home page builder (sections, banners, gallery)

### Admin panel (`/admin`)

Dashboard, Products, Variants, Categories, Inventory (stock, warehouses,
transfers, reservations, stock takes, reorder rules, channel inventory),
Orders, Customers, Reviews, Coupons, Gift cards, Shipping (zones &
methods), Tax, Pages, Blog, **Appearance (theme picker + design tokens)**,
Banners & gallery, Menus, **Analytics**, **Import / Export**, Settings,
Users (role-based: admin, manager, customer).

### Platform

- Bulk **import/export** for products and categories (CSV or JSON,
  preview, all-or-nothing commit) — see §10
- **Analytics & recommendations** (opt-in, privacy-first) — see §11
- **Theme system**: 5 bundled themes, scaffold tool, live preview,
  per-store selection — see §9
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
5 products, reviews, coupons, shipping methods, banners).

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

1. Set `provider = "postgresql"` in `apps/api/prisma/schema.prisma`
2. Point `DATABASE_URL` at your instance, e.g.
   `postgresql://store_user:store_password@localhost:5432/store_db`
   (the dev compose file already provides one with those credentials)
3. `cd apps/api && npx prisma migrate dev` to build a fresh schema

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
│   │       │   #   menus, newsletter, pages-cms, settings, theme, importExport,
│   │       │   #   downloads, currency, storage, …
│   │       ├── services/      # email, payment helpers
│   │       ├── utils/         # logger, csv, content blocks
│   │       ├── app.ts         # express app, routes, limits
│   │       └── server.ts      # entry point, graceful shutdown
│   │   └── tests/             # unit + integration (mock-Prisma, no DB needed)
│   └── web/
│       ├── app/               # Next.js App Router: storefront + /admin
│       ├── themes/            # one directory per theme (see §9)
│       ├── components/        # shared UI
│       ├── lib/               # api client, http, i18n, theme, tracking, seo, …
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
fail closed per-feature but never crash the request; analytics tracking
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

- `theme.json` — validated at **build time** by a strict Zod schema:
  identity (key, name, author, semver), `features` (`rtl`, `darkMode`,
  `paid`), `tokens` (colors, fonts, radius, container width, card shadow,
  products-per-row, section toggles like `showTrustBar`), and an optional
  `sections` override map
- `sections/*.tsx` — component overrides for home-page sections
  (`hero`, `featured`, `categories`). Overriding replaces the platform
  section wholesale (there is no "wrap" mode yet).

**Bundled themes (5):** `default`, `minimal` (paid, text-first, serif),
`bold`, `dawnlight`, `pulse`.

**Developer workflow for a new theme:**

```bash
node scripts/scaffold-theme.mjs solar --name "Solar"
```

The scaffold performs every registration touch point (theme.json + three
contract-compliant RTL-safe section stubs, registry entry, section
component map, RTL test matrix, theme-picker test pin). Then edit tokens
and sections; a malformed `theme.json` fails the **build** with a readable
path; a forgotten RTL registration fails the test suite. Preview at
`/preview/solar`; activate per store in **Admin → Appearance**.
Per-store token overrides layer on top of the active theme.

**Limits (honest):** themes are versioned with the platform (code review,
no runtime upload); `paid: true` is metadata only (no license check or
marketplace yet); `darkMode` is a capability badge only.

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
- **Orders**: list, create, status updates (admin), cancel, receipts,
  tracking, per-item download tokens
- **Payments**: process (staff settlement), Stripe Checkout + webhook
- **Users / Customers**: CRUD (admin), per-user orders & wishlist
- **Catalog ops**: categories (tree), inventory & warehouses, coupons,
  gift cards, shipping, tax
- **CMS**: pages, blog, banners, menus, home sections, settings, theme
- **Store ops**: `import-export` (§10), `analytics` (§11),
  `recommendations` (trending, new-arrivals, also-bought, bought-together,
  history, personalized), `downloads`, `currency`, `storage` (uploads)
- **Health**: `GET /health`

Authoritative source: `apps/api/src/modules/*/…routes.ts` (every route is
unit/integration-tested or covered by a live `verify-*.py` script).

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
`main`: **api-checks** (migrate, seed, start API, `regression.sh`,
`verify-import-export.py`, commerce/theme/users/404/dashboard verifiers)
and **ui-checks** (`next build` + browser suites: page sweep, home
builder, banners, 404s, users, dashboard, pages, blog, sidebar geometry,
Unicode slugs).

## 15. Deployment

**Client install (recommended):** on a Docker host —

```bash
git clone <repo> /opt/store && cd /opt/store
./scripts/install-store.sh     # compose (prod profile) + seed, one command
```

The installer generates a fresh random `JWT_SECRET`, builds
`docker-compose.prod.yml` (api + web + postgres + redis + minio + mailhog),
converges the DB on first boot and seeds through the API container.
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
