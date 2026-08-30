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

These are the changes from the three performance/scalability passes,
each verified by the test suites (711 API integration + 267 API unit +
819 web tests, all green):

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

Pass two then parallelised the remaining checkout loops (analytics
events, per-line download mints, stock decrements grouped per product),
collapsed `POST /api/cart/sync` from 2N queries to 2, and moved the
durable-by-need stores (contact / newsletter / stock alerts) from
module-level memory into the database. Pass three finished the
statelessness story (the CSRF token store became a table too, so the
API holds zero per-process state) and replaced the O(catalog)
in-memory attribute filter/facets with the `VariantAttribute` index -
see Known limits 1 and 3 below.

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

The API now holds **no per-process state** (all form stores and the
CSRF token store are database rows), so it is safe to run N instances
behind a load balancer. Concretely:

1. **Switch to Postgres** (runbook in Known limit 2 below — the
   committed migrations are SQLite dialect, so the migration history
   must be regenerated for the PG provider).
2. **Add Redis** for the read cache (product lookups, facets,
   recommendation lists all route through `cache.*` when it's up).
3. **Run N API processes** behind the LB. All per-request state is in
   Postgres; the schedulers (`inventory-scheduler`,
   `currency.scheduler`) must run on exactly ONE instance (they are
   `setInterval` loops) — either pin one instance as "worker" or move
   the schedules to a cron that calls the existing
   `/api/inventory/jobs/run`-style endpoints. The Socket.IO instance
   for real-time features needs an adapter (e.g.
   `@socket.io/redis-adapter`) if it is ever used across instances.

## Known limits (honest list)

### 1. ~~In-memory form stores~~ — all durable now
Contact messages, stock-alert subscriptions, newsletter subscribers
(migration `20260830010000`) and even the CSRF token map
(`20260830020000`, `CsrfToken` table in `middleware/csrf.ts`) are
database rows. The API holds **no per-process state** anymore: any
number of instances agree on all of it, and a deploy no longer wipes
anything. The CSRF guard itself remains unmounted on purpose — the
API authenticates with Bearer JWTs (CSRF-immune) and the web client
does not use the x-session-id/x-csrf-token flow; mounting it today
would 403 the storefront's unauthenticated POSTs. The header comment
in `middleware/csrf.ts` documents exactly what enabling it requires.

### 2. SQLite is a single-writer database
Fine for the default install. Sustained write-heavy traffic (flash
sales, high order rates) wants Postgres. Note the schema is
provider-agnostic but the committed migrations are **SQLite dialect**
(`DATETIME` etc.) — a Postgres deployment cannot reuse them as-is.
The runbook:

1. Start Postgres (the dev `docker/docker-compose.yml` already has a
   healthy postgres:16 service; a client server can use any PG).
2. In `apps/api/prisma/schema.prisma` set
   `provider = "postgresql"` in the `datasource` block.
3. Regenerate the migration history for PG:
   `npx prisma migrate dev --name init_pg` on a throwaway database
   (the committed SQLite migrations stay in git for SQLite installs;
   a PG deployment works from its own provider-matched history).
4. Set `DATABASE_URL=postgresql://user:pass@host:5432/store` and
   size the pool: append `?connection_limit=<2 × cores + 1 per API
   instance>` (Prisma's default of 5 is tuned for a laptop, not a
   load-balanced deployment).
5. Re-run the test suites against the PG URL — the integration suite
   is provider-agnostic by construction (it mocks the client), and
   `scripts/verify-import-export.py` + the CI browser suites exercise
   the real thing.

### 3. ~~Attribute filtering is O(catalog) in memory~~ — indexed now
The variant-attribute filter (and the facet tally) used to fetch
**every variant of every candidate product** and JSON-parse its
attributes in JS. They now run against the `VariantAttribute`
index table (migration `20260830030000`): one indexed row per
(variant, key, value) pair, maintained by
`syncVariantAttributes()` at every variant write site
(`variant.service` create/update/delete, the product-create route,
the import/export commit). The filter intersects per-key variant-id
lists in SQL and scopes candidates with `variants: { some: ... }` —
exact semantics preserved (OR within a key, AND across keys,
inactive variants excluded). Existing stores need a one-time
`apps/api/prisma/backfill-variant-attributes.ts` run after the
migration (idempotent).

Still post-filtered in JS (bounded by the candidate set): the
`onSale` inequality check (compareAtPrice > price is a
column-to-column comparison Prisma can't express; the SQL pre-filter
already narrows to `compareAtPrice != null`) and `minRating`
(a HAVING-style aggregate over reviews). Both are O(candidates),
not O(catalog), and neither is a practical bottleneck below
~100k products.
`listProducts` pulls candidates then post-filters attribute/onSale/
minRating in JS (Prisma can't express "a variant's JSON attribute
contains X" efficiently). At ~10k active products this still responds in
tens of ms on Postgres; beyond that, attribute filtering should move to
a relational `product_variant_attributes` table. Same story for
`getFacets`'s review/variant scans.

### 4. ~~Order placement is a long sequential chain~~ — batched
Order creation now runs: create order → **parallel** analytics events →
Stripe session → **parallel** per-line download mints (each keeping its
own try/catch) → re-fetch → **parallel** stock decrements (grouped per
product, since lines for the same product share a stock row) → consume
reservations → clear cart → coupon bump → email (fire-and-forget). The
cart migration endpoint (`POST /api/cart/sync`) went from 2N queries
(delete + per-row findFirst/create) to 2 (deleteMany + one createMany
with duplicates merged in JS).

## Measuring

- API: `GET /health` + the structured winston logs (`LOG_LEVEL`).
  Per-endpoint timings: enable `morgan` verbose (already wired through
  `loggerStream`).
- Web: the Lighthouse CI numbers from `next build` output + the browser
  devtools. The image pass and the font self-hosting (no render-blocking
  external requests) are the two biggest client-side wins already made.
- Database: the new indexes show up in `EXPLAIN QUERY PLAN` for the
  order-detail and inventory-log queries.
