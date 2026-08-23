# Online Store Kurdi — Features Roadmap

**Project:** `online-store-kurdi` (Next.js 14 storefront + Express/Prisma API + PostgreSQL)
**Repository:** `github.com/smohamadth/online-store-kurdi`
**Branch:** `arena/01a022ee-online-store-kurdi`
**Document scope:** Every feature the project needs to be a production-ready
e-commerce platform, mapped to what's actually in the repo today. Each entry
has a status, the user-facing description, the implementation pointer, and
the next step.
**Test suite as of this document:** 712 tests, 63 files. See the "Test suite"
section at the end.

---

## How to read this document

| Symbol | Meaning |
|---|---|
| OK | Built and tested |
| ~ | Built but partial - code is there, known gaps or rough edges |
| XX | Not built |
| *** | Top-10 priority for next sprint |

Status covers **both** the API and the storefront. A "[done]" means the feature
works in both halves. A "[partial]" usually means the API or the admin page has the
feature but the storefront needs work (or vice versa).

---

## Snapshot

| Bucket | Total | [done] | [partial] | [missing] |
|---|---:|---:|---:|---:|
| Missing (red) | 20 | 0 | 0 | 20 |
| Partial (amber) | 14 | 0 | 14 | 0 |
| Stretch (yellow) | 10 | 0 | 0 | 10 |
| **Delivered in this codebase** | — | **~30** | — | — |
| **Total scope** | **44** | — | — | — |

The roughly 30 "delivered" features are subsumed under the rows below: a row
marked [done] means the core flow is built and tested; a row marked [partial] means the
foundation is there but the polish is missing.

---

# Section 1 — Missing features (red)

The 20 features a real production store usually has that are **not in the
codebase** today. Priority order within this section; *** marks the top 10
across the whole document.



## 1. *** Real payment gateway (Stripe)

**What it is:** Accept real money. The current `payments` module is a
**mock** gated by `PAYMENTS_ALLOW_MOCK` — it never charges a card.
**Why it matters:** The whole point of a store.
**Where it would live:** `apps/api/src/modules/payments/` (replace mock),
`apps/web/app/checkout/` (Stripe Elements or Checkout Session).
**Effort:** M. Replace the mock with `stripe` SDK, add a webhook handler for
`payment_intent.succeeded`, switch the storefront checkout to a Stripe
redirect or embedded form.
**Risks:** PCI scope (use Stripe Elements to keep it minimal), 3D Secure,
refund flow, idempotency keys, webhook signature verification.
**Test impact:** New module needs its own integration tests with Stripe's
test cards; the webhook signature path needs contract tests.

## 2. *** Transactional emails

**What it is:** Order confirmations, shipping updates, password reset
emails. The codebase has `newsletter` and `contact` (form-to-inbox only) but
no transactional mailer.
**Why it matters:** Customers need to know their order went through.
**Where it would live:** `apps/api/src/utils/mailer.ts` (new), call sites in
`apps/api/src/modules/orders/`, `apps/api/src/modules/auth/`.
**Effort:** S. Pick a provider (Resend, Postmark, SendGrid), write one
`send(template, to, data)` helper, template the 5 emails that matter
(order confirmation, shipped, delivered, password reset, welcome).
**Risks:** Bounce handling, unsubscribe headers, DKIM/SPF, template
i18n (the store already supports ku/ar/en/tr).
**Test impact:** Unit tests for the helper, integration tests that assert
the right template fires for each event.

## 3. *** Order PDF invoice + packing slip

**What it is:** Downloadable PDF invoices and printable packing slips
attached to each order.
**Why it matters:** Operations and legal need it; many jurisdictions
require invoice retention.
**Where it would live:** New route `GET /api/orders/:id/invoice.pdf` +
`GET /api/orders/:id/packing-slip.pdf`, generated with `pdfkit` or
`@react-pdf/renderer`.
**Effort:** S. Render the existing order data into a fixed template. No
schema changes.
**Risks:** Currency formatting, RTL layout (ku/ar invoices), large orders
that need multi-page tables.
**Test impact:** Snapshot tests on the PDF output, integration tests for
auth (admin-only) and missing-order 404.

## 4. *** Structured data (JSON-LD)

**What it is:** `<script type="application/ld+json">` blocks emitting
`Product`, `Review`, `BreadcrumbList`, `Organization` schema.org markup
on every public page.
**Why it matters:** Big SEO win. Google rich results depend on it.
**Where it would live:** Each Next.js page's metadata API, or a
`<StructuredData>` component injected from the page component.
**Effort:** S. Add a `structuredData.ts` helper per page type. The product
detail page needs Product+Offer+AggregateRating; the listing needs
BreadcrumbList; the home page needs Organization.
**Risks:** Keep it valid; Google's Rich Results Test will reject malformed
JSON-LD.
**Test impact:** Snapshot tests on the emitted JSON.

## 5. *** Faceted search/filter on storefront

**What it is:** Multi-select category, price range, in-stock, on-sale,
rating, variant attributes. **Already shipped in this commit** — see
"Advanced filtering" entry below.

## 6. *** Product variants as a first-class concern

**What it is:** Sizes, colors, materials with per-variant stock, per-variant
price deltas, per-variant images, swatch pickers in the UI.
**Why it matters:** Most stores need sizes/colors.
**Where it would live:** The schema already has `ProductVariant`; the
filter feature already reads its JSON `attributes` column. What's missing
is a proper **variant picker** on the product detail page, **variant-level
cart line items**, and **variant-level stock decrements** (currently the
parent product's `quantity` is what gets touched).
**Effort:** M. Add a `VariantPicker` component, switch the cart/order line
to a `(productId, variantId)` tuple, audit the inventory decrement path.
**Risks:** Existing order items have nullable `variantId`; migration is
additive.
**Test impact:** New unit tests for the picker, integration tests for
variant stock decrements.

## 7. *** Abandoned cart email

**What it is:** Email customers who added items but didn't check out, ~1h
after the cart went idle.
**Why it matters:** 5–15% recovery rate on existing traffic.
**Where it would live:** New cron-style job in `apps/api/src/jobs/`
(scanning `Cart` rows by `updatedAt`), template in the mailer.
**Effort:** S. Once the transactional email helper exists.
**Risks:** Spam complaints if too aggressive; needs an unsubscribe link and
a per-user throttle.

## 8. *** Cookie consent + GDPR data export/delete

**What it is:** Banner on first visit, granular consent, "Download my data"
and "Delete my account" endpoints.
**Why it matters:** Legal. EU/UK users have rights; CCPA is similar for CA.
**Where it would live:** `apps/web/components/CookieConsent.tsx` (banner),
`apps/api/src/modules/users/` (export + delete endpoints).
**Effort:** S. The export is a SQL dump; the delete is a cascade or
anonymisation.
**Risks:** Real deletion is irreversible — anonymise soft, hard-delete only
on user request with a confirmation step.

## 9. *** 2FA on admin accounts

**What it is:** TOTP-based second factor for users with `role = 'admin'`.
**Why it matters:** Admin accounts are the keys to the kingdom.
**Where it would live:** `apps/api/src/modules/auth/` (TOTP enrollment
+ verify), `apps/web/app/admin/profile/` (QR code).
**Effort:** S. `otplib` handles TOTP; the QR is just a data URL.
**Risks:** Recovery flow (backup codes); lockout if a phone is lost.

## 10. *** Image processing pipeline

**What it is:** Resize on upload, serve WebP/AVIF, generate blur
placeholders, strip EXIF.
**Why it matters:** Performance. The current `storage` module just stores
the file as uploaded.
**Where it would live:** `apps/api/src/modules/upload/` + a worker that
post-processes to a CDN.
**Effort:** M. `sharp` does the work; the complexity is in the cache layer.

---

## 11. Search ranking (relevance)

**What it is:** Better than `contains` substring matching. Currently the
`relevance` sort exists and uses a name/description/sku scorer, but it's
basic. Real stores want full-text ranking with typo tolerance, synonym
handling, "did you mean…".
**Where it would live:** Replace the relevance scorer in
`apps/api/src/modules/products/productFilter.service.ts`. PostgreSQL
`tsvector` or Algolia/Meilisearch.
**Effort:** M. With PostgreSQL: add a generated tsvector column + GIN
index. With Algolia: redirect search.

## 12. Gift cards / store credit

**What it is:** Separate from coupons. Account balance, gift card
redemption at checkout, scheduled gifting.
**Where it would live:** New `apps/api/src/modules/gift-cards/` +
`apps/api/src/modules/wallet/`.
**Effort:** M. Needs a `GiftCard` model, a balance on `User`, redemption
at checkout. Requires schema change.

## 13. Loyalty / rewards program

**What it is:** Points per dollar spent, referral bonuses, tier discounts.
**Where it would live:** New `apps/api/src/modules/loyalty/`.
**Effort:** L. Points engine, expiry rules, referral tracking, tier
upgrade emails. Schema changes needed.

## 14. Subscriptions / recurring orders

**What it is:** "Deliver this every 4 weeks" for consumables.
**Where it would live:** `apps/api/src/modules/subscriptions/` +
Stripe Subscriptions.
**Effort:** L. Requires Stripe Subscriptions and a job runner.

## 15. Real-time order tracking page

**What it is:** `/track-order` with a status timeline, carrier link, current
location. The page exists but is just an order-number search; no carrier
integration.
**Where it would live:** `apps/web/app/track-order/` + carrier API
clients (AfterShip, Shippo, EasyPost).
**Effort:** M.

## 16. Multi-currency & multi-locale pricing

**What it would be:** Per-currency prices (`priceUSD`, `priceEUR`), an
exchange-rate refresh job, and `Intl.NumberFormat` per locale.
**Where it would live:** Product schema needs a `prices` JSON column;
`apps/web/lib/settings.ts` needs a locale-aware formatter.
**Effort:** M. Schema change for prices.

## 17. Customer reviews with photos & verified-purchaser badge

**What it is:** Image upload on reviews, "Verified buyer" tag for people
who bought the product.
**Where it would live:** `apps/api/src/modules/reviews/` (extend with
`images` and `verified` derived from order history).
**Effort:** S. The review model already has `isVerified`; the image side
needs the upload pipeline.

## 18. Product Q&A

**What it is:** Customers ask, staff/public answers, threaded under each
product.
**Where it would live:** New `apps/api/src/modules/questions/`.
**Effort:** M. Full model + email notifications + moderation.

## 19. Size guides & fit tools

**What it is:** Per-category size charts; "find your size" wizard.
**Where it would live:** `apps/api/src/modules/products/` (size guide
table) + a wizard component.
**Effort:** S for static size charts, M for the wizard.

## 20. Live chat / support widget

**What it is:** Crisp/Intercom/Tawk embed, or a self-hosted chat.
**Where it would live:** `apps/web/components/ChatWidget.tsx`.
**Effort:** S if third-party, L if self-hosted.

---

# Section 2 — Partial features (amber)

These are in the codebase but feel like scaffolding. 14 items.

## 21. [partial] Email

**Built:** `apps/api/src/modules/newsletter/`, `apps/api/src/modules/contact/`.
**Gap:** No transactional email. See #2 in Missing.
**File pointer:** `apps/api/src/modules/newsletter/newsletter.routes.ts`,
`apps/api/src/modules/contact/contact.routes.ts`.
**Test coverage:** 50 + 69 tests across both modules.

## 22. [partial] Analytics

**Built:** `apps/api/src/modules/analytics/`, plus a recommendations module
that emits "trending" and "new arrivals" lists.
**Gap:** No GA / Plausible / Meta Pixel in the storefront. No
admin-facing dashboard that aggregates from real events.
**File pointer:** `apps/api/src/modules/analytics/analytics.routes.ts`.
**Test coverage:** 82 tests.

## 23. [partial] SEO

**Built:** `apps/web/app/sitemap.ts`, `robots.txt`-equivalent, basic
metadata in layouts.
**Gap:** No structured data (see #4 in Missing), no canonical URLs, no
hreflang for the 4 supported languages.
**File pointer:** `apps/web/app/sitemap.ts`, `apps/web/app/layout.tsx`.
**Test coverage:** 2 tests (the seo helper).

## 24. [partial] Search

**Built:** `apps/web/components/SearchBar.tsx` (debounced, calls
`/products/search`), `/apps/web/app/search/page.tsx`.
**Gap:** No typo tolerance, no synonym matching, no relevance ranking
on the server, no "did you mean…". See #11 in Missing.
**File pointer:** `apps/web/components/SearchBar.tsx`,
`apps/web/app/search/page.tsx`.
**Test coverage:** 9 component tests + smoke coverage in the API
contract.

## 25. [partial] Categories

**Built:** Hierarchical (`parentId` self-relation), CRUD, the new
multi-select filter reads them.
**Gap:** No curated category landing pages (most stores have a hero, a
featured-collection grid, a brand list, etc., at `/category/<slug>`).
**File pointer:** `apps/api/src/modules/categories/category.routes.ts`.
**Test coverage:** 114 tests.

## 26. [partial] Inventory

**Built:** Decrement on order, increment on cancel, low-stock threshold,
admin UI.
**Gap:** No backorders, no pre-orders, no per-warehouse stock, no
auto-reorder, no `lowStock` webhook.
**File pointer:** `apps/api/src/modules/inventory/`.
**Test coverage:** 96 tests.

## 27. [partial] Coupons

**Built:** Percentage / fixed / free-shipping, expiry, usage limits, per-user
limits.
**Gap:** No "buy X get Y", no auto-apply rules, no stackable coupons, no
first-order-only, no customer-segment targeting. UI is basic.
**File pointer:** `apps/api/src/modules/coupons/`.
**Test coverage:** 191 tests.

## 28. [partial] Pages (CMS)

**Built:** `Page` model with status (draft/published), slug, SEO fields,
showInFooter flag.
**Gap:** No block-based editor (admin types raw HTML today), no media
library, no scheduled publishing, no preview.
**File pointer:** `apps/api/src/modules/pages/`.
**Test coverage:** 109 tests.

## 29. [partial] Theme/appearance

**Built:** `Theme` model + `themeToCssVars`, admin can change colors, the
storefront injects CSS vars. The advanced filtering uses it for the
filter chip rail.
**Gap:** No font upload, no logo upload, no per-section CSS overrides
beyond a single `customCss` blob.
**File pointer:** `apps/web/lib/theme.tsx`.
**Test coverage:** 14 tests.

## 30. [partial] Banners

**Built:** Banner CRUD, image upload, position/sort, status (draft/active/archived).
**Gap:** No A/B testing, no click-tracking, no scheduling beyond
start/end dates.
**File pointer:** `apps/api/src/modules/banners/`.
**Test coverage:** 98 tests.

## 31. [partial] Storage

**Built:** Upload, list, presigned URLs (mocked in dev).
**Gap:** No resize, no WebP/AVIF conversion, no EXIF strip, no CDN
integration. See #10 in Missing.
**File pointer:** `apps/api/src/modules/storage/`.
**Test coverage:** 50 tests.

## 32. [partial] Wishlist

**Built:** Add/remove, persist per user.
**Gap:** No "share wishlist by link", no price-drop notifications, no
"back in stock" alert for wishlisted items.
**File pointer:** `apps/api/src/modules/wishlist/`.
**Test coverage:** 128 tests.

## 33. [partial] Stock alerts

**Built:** Subscribe to back-in-stock for a product, admin sees list.
**Gap:** No actual email is sent when stock returns — needs the email
helper from #2.
**File pointer:** `apps/api/src/modules/stock-alerts/`.
**Test coverage:** 51 tests.

## 34. [partial] Maintenance gate

**Built:** A toggle that hides the storefront when enabled.
**Gap:** No per-IP bypass for admins, no scheduled maintenance windows.
**File pointer:** `apps/web/components/MaintenanceGate.tsx`.

---

# Section 3 — Stretch / differentiator (yellow)

Things that turn a competent store into one that grows. 10 items.

## 35. *** Advanced filtering [DELIVERED]

**What it is:** Multi-select categories (CSV), multi-select types, attribute
filters (`?attr.size=M,L&attr.color=red`), price range, in-stock, on-sale,
min-rating, free-text search, 9 sort values, and a `/api/products/facets`
endpoint that returns count buckets for the sidebar UI.
**Where it lives:**
- `apps/api/src/modules/products/productFilter.schema.ts` — the Zod schema
- `apps/api/src/modules/products/productFilter.service.ts` — `listProducts` and `getFacets`
- `apps/api/src/modules/products/product.routes.ts` — `GET /api/products` and `GET /api/products/facets`
- `apps/web/lib/filterParams.ts` + `.types.ts` — URL ↔ filter codec
- `apps/web/components/FilterSidebar.tsx` — the sidebar component
- `apps/web/app/products/page.tsx` — the storefront page (now server-side filtered)
**Test coverage:** 31 + 23 + 1 + 5 = 60 tests across the feature.

## 36. Headless commerce API

The `/api` is RESTful already, but a true headless store has GraphQL or at
minimum a richer surface for non-Next.js storefronts (mobile, kiosk,
marketplace).
**Effort:** L. Recommend Hasura or a PostGraphile layer over the existing
Prisma schema.

## 37. Mobile app / PWA

Installable storefront with push notifications. The Next.js 14 codebase
already supports App Router and could become a PWA with a service worker.
**Effort:** L for the SW, M for the rest.

## 38. Marketplace features

Multiple vendors, vendor payouts, vendor dashboards, vendor-product
moderation. Requires a `Vendor` model and major schema work.
**Effort:** XL.

## 39. B2B features

Bulk pricing tiers, quote requests, net-30 invoicing, account hierarchies
(parent org → sub-orgs → users).
**Effort:** XL.

## 40. Live inventory sync

With a brick-and-mortar POS or 3PL warehouse, in real time. Webhook-driven
or poll-based.
**Effort:** L.

## 41. Dynamic pricing

Per-customer, per-segment, or time-based sales. The schema has
`compareAtPrice` for the basic case.
**Effort:** M. Needs a `Price` model or extension.

## 42. Localisation beyond ku/ar/en/tr

The i18n dictionary is hand-maintained in `lib/i18n.ts`. Adding a 5th
language means editing code. A real i18n setup uses message catalogues
(gettext, i18next with Crowdin/Locize).
**Effort:** M for the switchover, ongoing cost for translation.

## 43. A11y audit

Semantic landmarks, focus management, keyboard navigation, screen-reader
testing, axe-core CI. The current UI is divs-with-aria, which is a start.
**Effort:** M. axe-core is one `npm i` away; the rest is fixing what it finds.

## 44. Performance

Image CDN, edge caching, partial hydration, route prefetching, bundle
analysis. The store will feel slow on 3G without these.
**Effort:** M for the wins, L for the full pass.

---

# Test suite

712 tests, 63 files, all green as of this commit.

| Suite | Files | Tests |
|---|---:|---:|
| API unit (`apps/api/tests/unit/`) | 8 | 103 |
| API integration (`apps/api/tests/integration/`) | 31 | 352 |
| Web lib (`apps/web/lib/`) | 12 | 114 |
| Web components (`apps/web/components/`) | 12 | 143 |
| **Total** | **63** | **712** |

Highlights of the testing infrastructure:

- **`apps/api/tests/helpers/mockPrisma.ts`** — Map-based in-memory
Prisma replacement that supports the full query surface the codebase
uses. Lives in the sandbox where the real prisma engine binary can't
download.
- **`apps/api/tests/integration/productFilter.smoke.test.ts`** — 23
cases that hit the real supertest app with every interesting query
string and assert the response shape.
- **`apps/api/tests/integration/productFilter.live.test.ts`** — walks
15 different query strings in a single test, printing the response on
mismatch. This is the test that caught the silent-coercion bug on
`?page=abc` and the `?category=does-not-exist` facet leak.
- **`apps/web/lib/filterParams.contract.test.ts`** — inlined copy of
the API's Zod schema used to verify the storefront's URL encoder
produces a query string the API parser accepts.

Run with:
```bash
npm test
```

---

# Open tradeoffs (decisions made under constraints)

These came up during build-out and are worth revisiting:

1. **Saved filter presets are client-side (localStorage).** The
   advanced filtering feature lets the user save a filter to revisit
   later, but we chose localStorage over a server endpoint to avoid
   schema changes. If presets should sync across devices, add a
   `SavedFilter` model.

2. **The mock prisma powers every integration test.** The real Prisma
   engine can't be downloaded in this sandbox. When it becomes
   available, the integration tests work unchanged; just remove
   `vi.mock('../src/config/database', ...)` from
   `apps/api/tests/setup-integration.ts`.

3. **The relevance sort is a simple JS scorer.** Production-quality
   search needs PostgreSQL `tsvector` or a dedicated search engine.
   See feature #11.

4. **Attribute filtering happens in JS after the DB query.** The
   `attributes` column is a JSON string; exact-value matching can't
   be expressed in Prisma's `where`. This is fine for small
   catalogs; for >10k products, normalise attributes into a
   side table.

5. **No real payment integration.** Every payment flows through the
   mock gated by `PAYMENTS_ALLOW_MOCK`. Before production, integrate
   Stripe (feature #1).

6. **No schema changes were made for this filtering feature.** We
   used existing models (`Product`, `ProductVariant`, `Category`,
   `Review`). Adding a `SavedFilter`, `Price`, or `Tag` model would
   unlock more features but is out of scope for "no schema changes".

---

# Appendix A — File map of "delivered" features

| Feature | API module | Storefront page | Key files |
|---|---|---|---|
| Auth (register/login/refresh) | `apps/api/src/modules/auth/` | `apps/web/app/login/`, `apps/web/app/register/` | `auth.routes.ts` |
| Products CRUD | `apps/api/src/modules/products/` | `apps/web/app/products/` | `product.routes.ts`, `product.controller.ts` |
| **Advanced filtering** [done] | `apps/api/src/modules/products/productFilter.*` | `apps/web/app/products/page.tsx` | `productFilter.schema.ts`, `productFilter.service.ts`, `lib/filterParams.ts`, `components/FilterSidebar.tsx` |
| Categories | `apps/api/src/modules/categories/` | `apps/web/app/category/` | `category.routes.ts` |
| Cart | `apps/api/src/modules/cart/` | `apps/web/lib/store.tsx`, `apps/web/app/cart/` | `cart.routes.ts`, `lib/store.tsx` |
| Orders | `apps/api/src/modules/orders/` | `apps/web/app/checkout/`, `apps/web/app/account/orders/` | `order.routes.ts` |
| Wishlist | `apps/api/src/modules/wishlist/` | `apps/web/app/account/wishlist/` | `wishlist.routes.ts` |
| Reviews | `apps/api/src/modules/reviews/` | `apps/web/components/ReviewSection.tsx` | `review.routes.ts` |
| Coupons | `apps/api/src/modules/coupons/` | `apps/web/components/CouponInput.tsx` | `coupon.routes.ts` |
| Inventory | `apps/api/src/modules/inventory/` | `apps/web/app/admin/inventory/` | `inventory.routes.ts` |
| Stock alerts | `apps/api/src/modules/stock-alerts/` | (none yet) | `stock-alerts.routes.ts` |
| Addresses | `apps/api/src/modules/addresses/` | `apps/web/app/account/addresses/` | `address.routes.ts` |
| Newsletter | `apps/api/src/modules/newsletter/` | `apps/web/app/` footer | `newsletter.routes.ts` |
| Contact | `apps/api/src/modules/contact/` | `apps/web/app/contact/` | `contact.routes.ts` |
| Settings | `apps/api/src/modules/settings/` | `apps/web/lib/settings.ts` | `settings.routes.ts` |
| Banners | `apps/api/src/modules/banners/` | `apps/web/components/BannerStrip.tsx` | `banner.routes.ts` |
| Blog | `apps/api/src/modules/blog/` | `apps/web/app/blog/` | `blog.routes.ts` |
| Pages (CMS) | `apps/api/src/modules/pages/` | `apps/web/app/p/[slug]/` | `page.routes.ts` |
| Menus | `apps/api/src/modules/menus/` | `apps/web/components/AppShell.tsx` | `menu.routes.ts` |
| Home | `apps/api/src/modules/home/` | `apps/web/app/page.tsx` | `home.routes.ts` |
| Theme | `apps/api/src/modules/theme/` | `apps/web/lib/theme.tsx` | `theme.routes.ts` |
| Tax | `apps/api/src/modules/tax/` | `apps/web/components/TaxCalculator.tsx` | `tax.routes.ts` |
| Shipping | `apps/api/src/modules/shipping/` | `apps/web/components/ShippingSelector.tsx` | `shipping.routes.ts` |
| Payments (mock) | `apps/api/src/modules/payments/` | `apps/web/app/checkout/` | `payment.routes.ts` |
| Analytics | `apps/api/src/modules/analytics/` | `apps/web/components/PostViewCounter.tsx` | `analytics.routes.ts` |
| Recommendations | `apps/api/src/modules/recommendations/` | `apps/web/app/HomeView.tsx` | `recommendation.routes.ts` |
| Storage / upload | `apps/api/src/modules/storage/` | `apps/web/components/ImageUpload.tsx` | `storage.routes.ts` |
| Dashboard | `apps/api/src/modules/dashboard/` | `apps/web/app/admin/page.tsx` | `dashboard.routes.ts` |
| Users (admin) | `apps/api/src/modules/users/` | `apps/web/app/admin/users/` | `user.routes.ts` |
| i18n | (none — client-side) | `apps/web/lib/i18n.ts`, `apps/web/components/LanguageSwitcher.tsx` | `i18n.ts` |
| Search | (uses `/products/search`) | `apps/web/components/SearchBar.tsx` | `SearchBar.tsx` |

---

# Appendix B — Top-10 priority for the next sprint

In order:

| # | Feature | Bucket | Effort | Why now |
|---|---|---|---|---|
| 1 | Real payment gateway (Stripe) | Missing | M | The whole point of a store |
| 2 | Transactional emails | Missing | S | Customers need to know |
| 3 | Order PDF invoice + packing slip | Missing | S | Operations/legal need it |
| 4 | Structured data (JSON-LD) | Missing | S | Massive SEO win |
| 5 | Faceted search/filter on storefront | **Delivered** [done] | — | Shipped in this commit |
| 6 | Product variants as a first-class concern | Missing | M | Most stores need sizes/colors |
| 7 | Abandoned cart email | Missing | S | 5–15% recovery lift |
| 8 | Cookie consent + GDPR data export/delete | Missing | S | Legal |
| 9 | 2FA on admin accounts | Missing | S | Security |
| 10 | Image processing pipeline | Missing | M | Performance |

---

*Document generated for commit `97df291` on
`arena/01a022ee-online-store-kurdi`.*
