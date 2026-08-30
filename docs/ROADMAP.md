# Store Builder — Product Roadmap

An honest, prioritized roadmap for the store builder, grounded in the
codebase (including the project's own `KNOWN_GAPS.md` self-assessment)
and a hands-on inventory/shipping review. Grouped by impact.

---

## Already strong (do NOT re-build)

- **Inventory is genuinely advanced** — warehouses, transfers, stock
  takes (cycle counts), reservations, auto-reorder + PO drafts,
  channels / 3PL webhooks, CSV import — all tested and green.
- **Shipping** now supports all four pricing types (flat / weight /
  price-percentage / item-count), with the advanced types wired
  end-to-end from the admin editor to the checkout calculator.
- **Storefront breadth**: digital products, variants, reviews with
  photos, coupons, gift cards, multi-currency, themes, blog/CMS,
  SEO / sitemap / JSON-LD, analytics, import/export.

---

## 🔴 Near-launch / would-block a real store

1. **Transactional email is logged, not delivered.** Orders, shipping
   notifications, password reset, welcome — all wired and ready, but
   they only reach the server log until real SMTP credentials are set.
   This is the single most customer-facing gap (customers never get
   their order confirmation).

2. **One-time DB backfill for existing stores.** The `VariantAttribute`
   index that makes product-filtering SQL-fast is maintained on new
   writes, but pre-existing variants need
   `apps/api/prisma/backfill-variant-attributes.ts` run once. A fresh
   install is fine; an upgrade is not.

3. **Migrations need the CI drift-guard blessing.** The four most recent
   hand-written migrations were verified to apply, but the byte-exact
   `prisma migrate diff` check has not run in CI yet. Before deploying,
   get `scripts/verify-migrations.sh` into CI (staged, waiting on
   permission) — it is the authority on whether the schema is actually
   consistent.

---

## 🟠 Important production hardening

4. **A real deployment path.** There is a Docker/installer story, but
   **no Postgres migration history** (the committed migrations are
   SQLite dialect) and **no continuous deployment**. For anything beyond
   a single small SQLite instance, execute the Postgres runbook in
   `SCALING.md` and stand up a pipeline.

5. **Multi-instance scheduling.** Inventory and currency schedulers are
   per-process `setInterval` loops. Running more than one API instance
   behind a load balancer double-runs jobs unless exactly one is pinned
   as the "worker" (or the schedules move to cron).

6. **3PL is inbound-only.** You accept signed webhooks, but there is no
   outbound push to a fulfillment provider — so marketplace listings
   will not auto-sync stock *to* the platform. A real operational pain
   for multi-channel sellers.

7. **CSRF guard is built but unmounted.** Deliberate (Bearer-JWT is
   CSRF-immune for the API), but if cookie/session auth or embeddable
   storefronts are ever added, this needs a client-side change.

---

## 🟡 Growth / differentiation features

8. **Import/export follow-ups** — image *upload* during import
   (currently URLs only), plus order/customer import. High value for
   onboarding existing stores.

9. **Elasticsearch is defined but unused** — listed as an optional
   advanced-search dependency but no code queries it. For large catalogs
   either wire it up or remove it to reduce confusion.

10. **Recommendations** currently depend on opt-in analytics; with
    tracking off they fall back to same-category popularity. Decent, but
    the "also bought" signal only works when analytics is on.

11. **Mobile/app and fulfillment** are not in the repo — no multi-locale
    invoicing/receipt variations, no shipping-label/rate integration
    with real carriers. For the target audience (Kurdish/Arabic
    markets), a real carrier integration + local payment providers
    would be a strong differentiator.

12. **Testing gaps** — the API test suite is excellent, but there was no
    Playwright E2E coverage of the actual storefront/admin flows in CI.
    (The CI `ui-checks` job did run browser *smoke* scripts via Python
    Playwright, but there was no `@playwright/test` spec suite.) **[FIXED]
    — see the E2E section below.**

---

## E2E coverage (item #12)

**Status: FIXED.** A proper `@playwright/test` E2E suite was added and
wired into CI so the real storefront + admin flows run against a live
API + seeded database (not the in-memory mocks the unit/integration
suites use).

What was added:
- `apps/web/e2e/storefront.spec.ts` — home renders, a seeded product
  page, add-to-cart → cart flow, real 404 for a bad slug.
- `apps/web/e2e/admin.spec.ts` — real admin login (admin@store.com /
  admin123), dashboard + sidebar, and the customer-access guard.
- `apps/web/e2e/global-setup.ts` — provisions a fresh seeded SQLite DB
  and points the web app at the local API before the servers start.
- `apps/web/playwright.config.ts` — starts the API (:3001) + Next.js
  production build (:3000) via `scripts/e2e-api.sh` /
  `scripts/e2e-web.sh`.
- `.github/workflows/ci.yml` — a new `e2e` job (`npx playwright test`,
  with a `playwright-report` artifact on failure).
- `@playwright/test` added to `apps/web` devDependencies; a
  `test:e2e` npm script; Playwright artifacts gitignored.

Run locally: `cd apps/web && npm run test:e2e` (builds the app first).

**Note:** browsers and the Prisma engine are downloaded by the tools
themselves (Playwright CDN / `binaries.prisma.sh`), which this authoring
sandbox cannot reach — so the suite is validated by compiling/discovering
the specs (`playwright test --list`) and by the code review, and is
executed for real in GitHub CI.

---
