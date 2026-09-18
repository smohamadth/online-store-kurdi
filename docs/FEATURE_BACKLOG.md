# Feature backlog

Candidate **features** (not bugs) for the store builder, recorded September
2026. Defects and production-hardening items live elsewhere:
`docs/AUDIT_2026-09.md` (security/correctness), `docs/ROADMAP.md` (launch
blockers and infrastructure), `KNOWN_GAPS.md` (the project's own
self-assessment), `STORE_BUILDER_BUGS.md` (the design tools).

This list was produced by inventorying what exists — 79 Prisma models, 33
admin sections, the storefront route tree — rather than from a generic
e-commerce checklist. Several things a list like that would name are
**already built**; see §0 so they are not re-proposed.

Priority reflects the target market: the README positions this as
Kurdish-first (Sorani/Arabic/Persian/Turkish, RTL), and the shipped payment
gateways (Zarinpal, IDPay, ZainCash, FIB) plus first-class cash-on-delivery
point at Iraq/Iran. That skews the ranking — COD and messaging apps matter
more here than they would for a Western store.

---

## 0. Already built — do not re-propose

Verified present in this checkout:

| Area | Where |
|---|---|
| **Product comparison** | `/compare`, `lib/compare.tsx`, `CompareBar`, entry points on `ProductCard` + PDP. 4-column cap, localStorage-backed, live price/stock refetch |
| Wishlist | `WishlistItem` model, account pages |
| Reviews with photos | `Review`, `ReviewPhoto` |
| Coupons, gift cards, store credit | `Coupon`, `GiftCard`, `StoreCredit` + transaction ledgers |
| Bundles / cross-sell pricing | `Bundle`, `BundleItem` |
| Abandoned-cart recovery | `AbandonedCartEmail`, scheduler |
| Recommendations | `ProductEmbedding`, `ProductSimilarity`, `RecommendationLog` |
| Affiliates incl. payouts | `Affiliate`, `AffiliateClick/Commission/Payout` |
| Multi-currency + rate history | `Currency`, `ExchangeRateSnapshot` |
| Inventory depth | warehouses, transfers, stock takes, reservations, reorder rules, 3PL channels |
| Double-entry accounting | `accounting.service.ts`, auto-post on settle |
| Blog / CMS / pages | `BlogPost`, `Page`, block editor |
| Digital products | `ProductDownload`, `DownloadLog`, token redemption |
| Theme Studio + plugins | `/admin/theme-studio`, `Plugin` hooks |
| Stock alerts ("notify me") | `StockAlert`, `StockAlertSubscription` |
| Order tracking page | `/track-order` |
| Admin sales reporting | `/api/reports/sales{,.pdf,.csv}`, `/admin/analytics` — KPIs with real period-over-period deltas, revenue chart, conversion funnel, PDF + CSV export |

> **Correction (September 2026).** An earlier revision of this table listed
> analytics as built without qualification. That was too generous: the admin
> analytics page was partly cosmetic — the three KPI trend captions were the
> hardcoded strings "↑ 12% / 8% / 5% from last month", and the "Revenue
> Overview" chart was a literal twelve-element array, neither connected to the
> database. There was also no date-range control (everything was silently 30
> days), no export, and the conversion-funnel endpoint had no UI at all. Those
> are now fixed and the row above describes what actually ships. The lesson
> worth keeping: "the endpoint exists" is not the same as "the merchant can
> see it", and an inventory that only greps the API will overstate the product.

Still missing from reporting, and worth a future entry: scheduled/emailed
reports, tax and VAT summaries by jurisdiction, cohort and repeat-purchase
analysis, and per-channel attribution.

## Wiring `verify-reports.py` into CI (one manual step)

`scripts/verify-reports.py` is committed and runnable, but the CI workflow
change that invokes it is NOT in this branch: the agent's GitHub credentials
cannot modify `.github/workflows/` (the push is rejected without the
`workflows` permission). Add this to the "Browser regression" job in
`.github/workflows/ci.yml`, after the "Admin dashboard figures" step:

```yaml
      # Guards the reporting surface, including the exact fabricated strings
      # ("12% from last month", the hardcoded revenue chart) that used to be
      # rendered as if they were real figures.
      - name: Admin reporting + PDF/CSV export
        run: python3 scripts/verify-reports.py
```

Until that lands, the script can be run by hand against a running stack:

```bash
python3 scripts/verify-reports.py   # honours WEB_URL / API_URL
```


---

## 1. Returns / RMA — **highest value**

**Status: absent.** `/returns` is 126 lines of static policy text. There is no
`Return` or `RMA` model anywhere in the schema.

A customer who wants to return something has no way to ask through the store.
Staff have no queue, no approval step, no audit trail. The *refund* machinery
is already built and good — gateway refunds, refund-to-store-credit, accounting
reversal via `autoPostRefund`, `voidCommissionForOrder` — but it is wired to
nothing on the request side. An admin must be told out-of-band, then find the
order manually.

**Why this ranks first here:** cash on delivery is a first-class payment method
in this build (`ALLOWED_MANUAL_METHODS`, dedicated accounting path), and COD
carries materially higher return rates than card payment — the buyer has not
committed money before seeing the goods. The sophisticated end of the flow was
built on top of a missing front end.

Sketch:

* `Return` (orderId, status, reason, requestedAt, resolvedAt, staff notes) and
  `ReturnItem` (orderItemId, quantity, condition, restock?).
* Customer: request from order detail, within a configurable window, with
  reason codes and optional photos (reuse the `ReviewPhoto` upload path).
* Admin: a queue alongside Orders — approve / reject / receive / refund, with
  the refund step calling the **existing** refund route rather than a new one.
* Restock on receipt through `inventory.service` so warehouse counts stay true.
* Settings: return window, whether COD orders may be returned, restocking fee.

## 2. Search facets — **cheapest real win**

`/search` is a single text box. There is no filtering by price, size, colour,
brand, or rating on the search or category pages.

The expensive half is **already done**: `VariantAttribute` exists and is
indexed precisely for fast attribute filtering, and the search provider
abstraction already supports Elasticsearch (`SEARCH_PROVIDER=elasticsearch`)
with Sorani-aware analysis. This is mostly an API surface (facet counts) plus
frontend, not new infrastructure.

Past a few hundred products this is the difference between finding an item and
leaving.

## 3. Messaging: WhatsApp / SMS notifications

Email is the only channel, and it is a weak one in the target market.
**WhatsApp order updates would land better than email in Iraq and Iran** — this
is probably the single highest-leverage integration for this specific audience.

* Customer: order placed / shipped / out for delivery / return approved.
* **Admin: nothing exists today.** No alert on a new order, a low-stock hit, or
  a failed payment — staff must refresh the dashboard. A notification model
  plus a per-staff channel preference would cover it.
* Keep the provider behind an interface, as `gateways/registry.ts` does for
  payments, so a local SMS aggregator can be dropped in.

## 4. Fulfilment beyond a tracking number

An order carries a single `trackingNumber` string and a `shippedAt`. Missing:

* **Partial shipments** — two items, one in stock, no way to ship one now. This
  is the piece merchants feel daily.
* Packing slips / picking lists.
* Carrier integration. For this market that likely means local couriers rather
  than DHL/FedEx; a generic `Shipment` record (items, carrier, tracking,
  status) unlocks partial fulfilment without committing to any carrier API.

## 5. Catalogue modelling gaps

* **No `Brand` model.** Categories only. Brand filtering is table stakes, and
  it is a prerequisite for a genuinely useful §2.
* **No `Tag` model** for cross-cutting merchandising ("summer", "gift ideas").
* **No product Q&A.** Reviews are post-purchase; pre-purchase questions are a
  different, conversion-relevant surface.
* **No size guides** — significant for the apparel that dominates this market,
  and directly reduces §1 volume.

## 6. Loyalty / points

No loyalty programme. Worth noting the mechanism already exists: `StoreCredit`
+ `StoreCreditTransaction` is a working ledger, so points are a thin layer
(earn rules, tiers, expiry) rather than new infrastructure.

## 7. Customer segmentation & marketing automation

Beyond abandoned carts there is no segmentation (RFM, first-time vs repeat,
lapsed) and no campaign tooling. `UserEvent` / `SearchQuery` / `EmailCapture`
already collect the raw signal.

## 8. Multi-tenancy — an architecture fork, decide early

`StoreSettings` is a single row keyed `'default'`. The product is described as
a *store builder*; if the intent is to host multiple merchants from one
deployment, that is a foundational change (tenant scoping on every model and
query) and **it gets more expensive with every feature added above**.

Not a feature request so much as a decision that should be made before the
backlog grows further — even if the answer is "single tenant, one deployment
per merchant, forever".

---

## Suggested order

1. **Returns/RMA** — largest genuine hole, amplified by COD, most of the back
   end already exists.
2. **Search facets** — indexing work is done; mostly frontend.
3. **WhatsApp/SMS** — nothing else on this list is as specific to where these
   stores actually operate.

Then §5 (brands/tags feed back into §2), then §4.

## Caveats on this list

* Market fit was inferred from the README and the shipped gateway set, **not
  from talking to merchants**. Real user complaints should outrank this
  ranking.
* §8 is a decision, not a task, and it is the only item whose cost grows the
  longer it is deferred.

## Smaller polish noted while inventorying

* `/compare` is essentially **not translated** — one `t()` call in 322 lines,
  with `Price` / `Availability` / `Rating` / `Category` / `Description` and the
  empty state hardcoded in English. It is a customer-facing page in a
  Kurdish-first product.
* The compare table cannot show **variant attributes** (size, colour, material)
  even though `VariantAttribute` exists — comparing two shirts shows price and
  rating but not the specs a shopper is actually weighing up.
