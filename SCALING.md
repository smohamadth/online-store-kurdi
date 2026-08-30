# Scaling

An honest map of where this store spends its time and what it takes to grow
it — from the default single-server install to a multi-instance deployment.
Companion to `KNOWN_GAPS.md` (what is unfinished) — this file covers *capacity*.

## Shape of the system

```
Browser ──► Next.js (web) ──► Express API ──► SQLite (default) / Postgres
                       │
                       └──► /uploads (static files, served by the API)
Optional: Redis (caching only - the store runs without it)
```

The API is a plain Express + Prisma service. Everything stateful about a
request (cart, sessions, stock) is in the database, so a single API
process is stateless *except* for the in-memory stores listed in
**Known limit 1** below.

## What was optimized (and why)

These are the changes from the performance pass, each verified by the
existing test suites (669 integration + 265 API unit + 819 web tests):

### 1. Checkout no longer round-trips per cart line
`POST /api/orders` used to do one sequential `product.findUnique` per line
item (plus the variant include). A 5-item cart was 5 round trips done one
after another. Now it loads all products and all referenced variants in
**two parallel queries** and resolves each line from in-memory maps.
On local SQLite the difference is small; over a networked Postgres
connection (~0.5–2 ms per round trip each) it removes N-2 sequential
hops from the single most important endpoint in the store.

### 2. The product page's facet sidebar is one batch, not ~10 trips
`GET /api/products/facets` (fired on every /products render) used to run
~10 independent count/aggregate queries **sequentially**: categories,
one count per product type, price min/max, in-stock, on-sale, reviews,
variants, options. All of them are independent (every where-clause is
computed up front), so they now fire as a single `Promise.all` batch, and
the per-type count loop collapsed into one `groupBy`. Same numbers,
~1/10th of the sequential latency.

### 3. Five missing indexes (migration `20260830000000`)
The schema was already well indexed (160+), but five hot lookup paths
scanned:

| Index | Serves |
|---|---|
| `OrderItem_variantId` | order detail's variant join, cancel-time stock restore |
| `InventoryLog_variantId` | admin inventory log filtered by variant |
| `InventoryLog_orderId` | per-order audit trail |
| `StockTakeItem_productId` | stock-take detail joins |
| `ShippingZone_isActive` | every checkout's "which zones apply" query |

Indexes are additive and safe to deploy; the CI drift guard
(`scripts/verify-migrations.sh`) verifies the migration reproduces the
schema.

### 4. Storefront images: lazy + async decode
Eleven raw `<img>` tags on customer-facing pages loaded eagerly and
synchronously. They now go through `StoreImage` (client components) or
`loading="lazy" decoding="async"` (server components). The article hero
on blog posts stays eager (it is the LCP candidate). Admin-only preview
images were left as-is deliberately.

## Running bigger: the single-node path

The default install (SQLite + 1 API process + 1 web process) comfortably
serves a small/medium store because:

- **Prisma pools connections.** For SQLite the pool is irrelevant (one
  writer); for Postgres the default pool (5 connections) should be raised
  with `DATABASE_URL`'s `?connection_limit=` query parameter to roughly
  `2 × CPU cores + 1` per API process.
- **The rate limiter is the first line of defence.**
  `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` (env) cap anonymous abuse
  before it reaches the database.
- **Redis is optional but recommended above ~50 req/s.** Product reads
  (by id/slug, featured) are already cached through `lib` → the API's
  `cache` helper when Redis is up; without it every read hits the
  database. Turning Redis on is a config change, not a code change.
- **Images are pre-generated derivatives** (thumbnail/card/detail/zoom)
  served as static files — no on-the-fly processing in the request path.

## Scaling out: multiple API instances

The API is safe to run behind a load balancer **once the in-memory
state is moved to the database** (Known limit 1). Concretely:

1. **Switch to Postgres** (the schema is provider-agnostic;
   `docker/docker-compose.yml` already ships a Postgres profile).
   Run `prisma migrate deploy` — the migration history is shared.
2. **Add Redis** for caching and (after step 4) for the stateful stores.
3. **Run N API processes** behind the LB. All per-request state is in
   Postgres; the schedulers (`inventory-scheduler`, `currency.scheduler`)
   must run on exactly ONE instance (they are `setInterval` loops) —
   either pin one instance as "worker" or move the schedules to a cron
   that calls the existing `/api/inventory/jobs/run`-style endpoints.
   The Socket.IO instance for real-time features needs an adapter
   (e.g. `@socket.io/redis-adapter`) if it is ever used across instances.
4. **Move the in-memory stores to the DB** (Known limit 1).

## Known limits (honest list)

### 1. Four in-memory stores do not survive a restart or scale out
Deliberate, documented in each file — but they bound horizontal scale:

| Store | Where | Effect of a restart / second instance |
|---|---|---|
| CSRF tokens | `middleware/csrf.ts` | tokens invalidated (and CSRF protection is not mounted anyway — JWT + CORS are the real guard) |
| Contact messages | `modules/contact/contact.routes.ts` | messages lost |
| Stock-alert subscriptions | `modules/stock-alerts/stock-alert.routes.ts` | subscriptions lost, "N people want this" resets |
| Newsletter subscribers | `modules/newsletter/newsletter.routes.ts` | subscribers lost |

Fix path (when a store needs to scale): add a small model for each
(the schema already has the migration machinery + drift guard), swap the
Map/Set for Prisma calls, and the endpoints' contracts don't change.
Until then: run one API instance, or accept the data loss on restart.

### 2. SQLite is a single-writer database
Fine for the default install. Sustained write-heavy traffic (flash
sales, high order rates) wants Postgres. The app already supports it —
only the connection string changes, plus the pool sizing above.

### 3. Some read paths are O(catalog) in memory
`listProducts` pulls candidates then post-filters attribute/onSale/
minRating in JS (Prisma can't express "a variant's JSON attribute
contains X" efficiently). At ~10k active products this still responds in
tens of ms on Postgres; beyond that, attribute filtering should move to
a relational `product_variant_attributes` table. Same story for
`getFacets`'s review/variant scans.

### 4. Order placement is a long sequential chain
After the batched lookups, order creation still runs: create order →
analytics → Stripe session → mint downloads → re-fetch → decrement stock
per line → consume reservations → clear cart → coupon bump → email.
Each step is independently necessary (and the email is already
fire-and-forget), but the download-mint and analytics loops could be
parallelised per line if checkout latency ever needs another slice.

## Measuring

- API: `GET /health` + the structured winston logs (`LOG_LEVEL`).
  Per-endpoint timings: enable `morgan` verbose (already wired through
  `loggerStream`).
- Web: the Lighthouse CI numbers from `next build` output + the browser
  devtools. The image pass and the font self-hosting (no render-blocking
  external requests) are the two biggest client-side wins already made.
- Database: the new indexes show up in `EXPLAIN QUERY PLAN` for the
  order-detail and inventory-log queries.
