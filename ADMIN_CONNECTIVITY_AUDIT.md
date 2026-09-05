# Admin feature connectivity audit

**Date:** 2026-09-05  
**Scope:** every page under `/admin` (sidebar + nested inventory/CMS routes).  
**Question:** does the **frontend** call a **backend** that **persists** (DB or documented disk), and would a reload show the change?

## How this was tested

This sandbox has **no `node_modules`**, no running API, and no `dev.db`. A live browser round-trip (login → save → reload → SQL) **could not be executed here**.

What *was* done, systematically:

1. Inventory of **admin routes** from `apps/web/app/admin/layout.tsx` plus nested pages.
2. Extract every **HTTP path** each page (or its `lib/*` client) calls.
3. Match those paths to **Express mounts** in `apps/api/src/app.ts` and the module `router.*` handlers.
4. Match writes to **Prisma models** (`schema.prisma`) or documented **disk** stores (themes, i18n JSON, accounting files, plugins).
5. Flag **API without UI**, **UI comment without UI**, **fields stored but not editable**, and **persist that is not the SQL DB**.

Verdict key:

| Verdict | Meaning |
|---|---|
| **WIRED** | Admin UI → matching API → Prisma/disk write; GET exists to reload. Not live-executed. |
| **WIRED (disk)** | Same, but persistence is a file, not a Prisma table. |
| **PARTIAL** | Some actions wired; some fields or screens missing. |
| **API ONLY** | Backend + DB exist; **no admin page** (or comment-only). |
| **BROKEN / STALE** | UI claims a feature that is not in the page, or path mismatch. |

---

## Dashboard

| Area | FE | API | Persist | Verdict |
|---|---|---|---|---|
| Stats | `/admin` → `GET /dashboard/stats`, `GET /categories` | `dashboard.routes`, categories | Read-only | **WIRED** (read) |

---

## Catalogue

### Products — `/admin/products`

| Action | FE | API | DB | Verdict |
|---|---|---|---|---|
| List | `GET /products` (with token so `downloadUrl` round-trips) | `product.routes` | `Product` | **WIRED** |
| Create / update | `POST` / `PUT /products/:id` | Zod includes `isFeatured` | `Product` (+ images, variants) | **WIRED** |
| Delete | `DELETE /products/:id` | yes | yes | **WIRED** |
| Featured flag | checkbox `isFeatured` | `isFeatured` on create/update; `GET /products/featured` | column on `Product` | **WIRED** in code; **needs migrate** on old DBs (`as any` on featured query) |
| Translations | `ContentTranslationsEditor` | `PUT /content-translations/product/:id/:locale` | `ContentTranslation` | **WIRED** |

### Variants — `/admin/variants` and `/admin/products/[id]/variants`

| Action | FE | API | DB | Verdict |
|---|---|---|---|---|
| List / patch / create / delete | `/variants`, `/products/:id/variants` | `variant.routes` + `product-variant.routes` | `Variant`, options | **WIRED** |

### Categories — `/admin/categories`

| Action | FE | API | DB | Verdict |
|---|---|---|---|---|
| CRUD | `GET/POST/PUT/DELETE /categories` | `category.routes` | `Category` | **WIRED** |
| Translations | editor | content-translations | `ContentTranslation` | **WIRED** |

### Inventory

| Page | Writes | DB | Verdict |
|---|---|---|---|
| `/admin/inventory` | `POST /inventory/adjust` | `InventoryLog`, product/warehouse qty | **WIRED** |
| `/warehouses` | create, default, delete | `Warehouse` | **WIRED** |
| `/stock-takes` | create, apply, cancel | `StockTake` | **WIRED** |
| `/reservations` | list + `release-expired` | `StockReservation` | **WIRED** |
| `/reorder` | rules CRUD-ish, run, patch drafts | `ReorderRule`, `ReorderDraft` | **WIRED** |
| `/channels` | list + webhook secrets | `Channel`, `WebhookSecret` | **WIRED** |
| `/import` | `POST /inventory/import-csv` | stock rows | **WIRED** |

### Import/export — `/admin/import-export`

`GET /import-export/export/:entity`, `POST` preview/commit → Prisma transaction. **WIRED**.

---

## Commerce

### Orders — `/admin/orders`, `/admin/orders/[id]`

| Action | FE | API | DB | Verdict |
|---|---|---|---|---|
| List / detail | `api` + fetch | `GET /orders` | `Order` | **WIRED** (read) |
| Status | `PUT /orders/:id/status` | prisma update; errors shown (not fake success) | `Order.status` | **WIRED** |
| Refunds | order detail (payments module) | `POST /payments/refund` | `Payment` + order | **WIRED** in API; UI depends on order page |

### Coupons — `/admin/coupons`

`lib/coupons.ts` → `GET/POST/PUT/DELETE /coupons` → `Coupon`. **WIRED**.

### Gift cards — `/admin/gift-cards`

`GET/POST /gift-cards`, `POST .../cancel` → `GiftCard`. **WIRED**.

### Affiliates — `/admin/affiliates`

`lib/affiliates.ts` → `/affiliates/*` approve/suspend/rate/commissions/payouts; program flags `PUT /settings` (`affiliateEnabled`, `affiliateRate`) → `StoreSettings` + affiliate tables. **WIRED**.

### Shipping — `/admin/shipping`

Zones/methods CRUD → `ShippingZone`, `ShippingMethod`. **WIRED**.

### Tax — `/admin/tax`

Rates/classes CRUD → `TaxRate`, `TaxClass`. **WIRED**.

---

## Finance

### Accounting — `/admin/accounting`

File-based ledger (`accountingEngine`), not Prisma. Accounts, entries, reverse/void, close-year, post-from-order. **WIRED (disk)**.

### Payments — `/admin/payments`

`GET/PUT/DELETE /settings/payment-gateways` → stored on **settings** (gateway JSON), not a `Payment` row. **WIRED** (config persist). Card charges need env Stripe keys (documented).

---

## Customers

### Users — `/admin/users`

`GET/PUT /users/:id` including `role` / `isActive` with guards. **WIRED**.

### Reviews — `/admin/reviews`

`GET /reviews?limit=200`, `PUT` / `DELETE` → `Review`. **WIRED**.

### Profile — `/admin/profile`

`GET/PUT /users/:id`. **WIRED**.

---

## Content & design

### Pages / Blog

List `GET /pages/all`, `GET /blog/all`; create/update/delete; blocks; translations. Defaults to **published** if status omitted. **WIRED** (`Page`, `BlogPost`).

### Appearance — `/admin/appearance`

| Tab | Persist | Verdict |
|---|---|---|
| Theme tokens / active theme | `GET/PUT /theme`, `POST /theme/reset` | `ThemeSettings` | **WIRED** |
| Zip install / delete | `/theme-studio/install`, `DELETE /theme-studio/themes/:key` | disk catalog + optional `activeTheme` | **WIRED (disk)** |
| Apply theme home | `applyThemeHomeLayout` → `POST /home-sections/apply-theme` | **replaces** `HomeSection` rows | **WIRED** |
| Home builder | `lib/homeSections.ts` CRUD/reorder/reset | `HomeSection` | **WIRED** |
| Home versions | `localStorage` only | **not DB** | **PARTIAL** |

### Theme Studio — `/admin/theme-studio`

`GET/PUT /theme-studio/themes/:key` → `theme.json` on disk. Bundled keys refuse PUT. Apply home as above. **WIRED (disk)** for custom themes.

### Plugins — `/admin/plugins`

Install zip, config, enable, test, log, delete → plugin state files. **WIRED (disk)**. Code in zips not executed.

### Banners — `/admin/banners`

`GET /banners/all`, POST/PUT/DELETE → `Banner`. **WIRED**.

### Menus — `/admin/menus`

Menus + items CRUD → `Menu`, `MenuItem`. **WIRED**.

---

## Insights & config

### Analytics — `/admin/analytics`

`GET /analytics/*`, `GET /dashboard/stats`. Read-only. **WIRED** (read). Ingest is storefront `/analytics/track`.

### Languages — `/admin/languages`

`GET/PUT /i18n/storefront` → **in-memory + `data/storefront-i18n.json`**, not Prisma. Save is best-effort (`saveToDisk` swallows errors). **WIRED (disk)**; **not** the SQL DB. Multi-instance would not share unless they share that file.

### Settings — `/admin/settings`

`GET/PUT /settings` → `StoreSettings` upsert. Identity, address, currency **code/symbol**, SEO, social, maintenance. Save only reports success on 2xx. **WIRED** for those fields.

**PARTIAL / stale vs the page’s own comment:**

| Claimed or stored | In settings UI? |
|---|---|
| Email template editor `GET/PUT /settings/email-templates` | **No** — comment only |
| Test email `POST /settings/test-email` | **No** |
| `googleAnalyticsId` | **API + storefront layout yes; settings form no** |
| `storeDescription` | In React state, **no input** (still sent on save if loaded) |
| Timezone / units (file header) | **No fields** |
| Country select | Only US/GB/DE/FR |

---

## Backend exists, no admin UI (API ONLY)

These persist if you call the API; merchants cannot manage them in the sidebar:

| API | DB / store | Notes |
|---|---|---|
| `GET /newsletter/subscribers` | `NewsletterSubscriber` | Subscribe is storefront-only |
| `GET /contact` | `ContactMessage` | Form is storefront-only |
| `GET/POST/PUT /currencies`, `POST /currencies/refresh` | `Currency`, `ExchangeRateSnapshot` | Storefront reads enabled currencies; **no admin currencies page**. Store **display** currency is `StoreSettings.currency` on Settings |
| `POST/GET/DELETE /bundles` | `Bundle` | No `/admin/bundles` |
| `/api/developers` bootstrap | read settings/menus | Theme-dev helper, not a merchant screen |
| Email templates | `EmailTemplate` | API only (see Settings) |

---

## Persist that is intentionally not Prisma

| Feature | Store |
|---|---|
| Theme Studio / zip themes | `apps/web/themes/<key>/theme.json` (and API themes dir) |
| Languages / UI strings | `data/storefront-i18n.json` + memory |
| Accounting | accounting data files |
| Plugins | plugin state files |
| Home builder undo/versions | `sessionStorage` / `localStorage` |
| ThemeProvider cache | `localStorage.themeSettings` (mirror of API, not source of truth) |

---

## Connection risks (not “missing pages”)

1. **Live home ≠ Studio canvas** until **Apply theme home**. Tokens still persist via `PUT /theme`.
2. **`isFeatured`**: UI and Zod wired; Prisma query uses `as any`. If migration not applied, featured writes/reads can fail at runtime.
3. **Languages**: PUT can “succeed” in memory even if `writeFileSync` fails (errors swallowed).
4. **Settings GET fallback** still hydrates from `localStorage` if API is down — display only; Save refuses without token/API.
5. **Zip React sections** never persist as running code (data-only).
6. **This environment** did not boot Express/Prisma, so **no HTTP 200 persistence proof**.

---

## Sidebar pages — rollup

| Admin path | FE→API | Persist | Verdict |
|---|---|---|---|
| `/admin` | yes | n/a | WIRED (read) |
| `/admin/products` | yes | `Product` | WIRED |
| `/admin/variants` | yes | `Variant` | WIRED |
| `/admin/categories` | yes | `Category` | WIRED |
| `/admin/inventory` (+ nested) | yes | inventory models | WIRED |
| `/admin/import-export` | yes | Product/Category | WIRED |
| `/admin/orders` | yes | `Order` | WIRED |
| `/admin/coupons` | yes | `Coupon` | WIRED |
| `/admin/gift-cards` | yes | `GiftCard` | WIRED |
| `/admin/affiliates` | yes | Affiliate* + settings | WIRED |
| `/admin/shipping` | yes | Shipping* | WIRED |
| `/admin/tax` | yes | Tax* | WIRED |
| `/admin/accounting` | yes | disk | WIRED (disk) |
| `/admin/payments` | yes | settings JSON | WIRED |
| `/admin/users` | yes | `User` | WIRED |
| `/admin/reviews` | yes | `Review` | WIRED |
| `/admin/pages` | yes | `Page` | WIRED |
| `/admin/blog` | yes | `BlogPost` | WIRED |
| `/admin/appearance` | yes | `ThemeSettings` + `HomeSection` | WIRED |
| `/admin/theme-studio` | yes | disk + optional apply-home DB | WIRED (disk) |
| `/admin/plugins` | yes | disk | WIRED (disk) |
| `/admin/banners` | yes | `Banner` | WIRED |
| `/admin/menus` | yes | `Menu` | WIRED |
| `/admin/analytics` | yes | n/a | WIRED (read) |
| `/admin/languages` | yes | JSON file | WIRED (disk) |
| `/admin/settings` | yes | `StoreSettings` | **PARTIAL** (core yes; email templates / GA / timezone UI missing) |
| `/admin/profile` | yes | `User` | WIRED |

**Count:** 28 sidebar/nested admin surfaces checked. **None** of the nav pages call a non-existent API path. **Gaps** are missing UIs for existing APIs, Settings comment drift, and non-SQL stores.

---

## What a live pass would still need

On a machine with `npm ci`, `prisma migrate deploy`, seed, API `:3001`, web `:3000`:

1. Admin login.
2. For each **WIRED** row: mutate → hard reload → GET matches.
3. SQL or Studio: row exists after PUT.
4. Featured: confirm `Product.isFeatured` column exists.
5. Languages: confirm `data/storefront-i18n.json` after Save.
6. Apply theme home: `HomeSection` count/keys change; `/` reflects it.

That live pass was **not** run in this sandbox.
