# Mobile Responsiveness Audit & Fixes

**Branch:** `arena/01a022ee-online-store-kurdi`
**Scope:** storefront + admin, including RTL (Kurdish/Arabic)
**Date:** 2026-08-25

## Why this exists

Playwright cannot be used in this sandbox: `cdn.playwright.dev` and
`playwright.azureedge.net` are SSL-blocked at the IP layer, so the
Chromium binary can't be downloaded (the same root cause that already
broke `binaries.prisma.sh` for the API tests). Instead, this pass did a
static audit of the responsive surface, fixed the high-severity issues
in code, and pinned each fix with a regression test under happy-dom +
React Testing Library.

The happy-dom tests assert on actual computed `style` values (padding,
gridTemplateColumns, overflow, etc.) at simulated viewport widths, so a
future refactor that drops a `useIsMobile()` or hard-codes a width
again will fail the suite.

## Fixes shipped

### 1. `<html lang>` and `dir` are now server-rendered

`app/layout.tsx` previously hard-coded `<html lang="en">` regardless of
the visitor's language. The client-side `useTranslation` hook then had
to flip the attribute on mount, causing a flash of LTR/English content
for Kurdish/Arabic visitors and breaking screen-reader pronunciation
and bdi behaviour on the very first paint.

Now:
- A new `lib/serverLocale.ts` resolves the locale from a
  `cms.lang` cookie (when present) and the `Accept-Language` header.
- The root layout passes the resolved `{ code, dir }` into the
  `I18nSeedProvider` (in `lib/I18nSeedProvider.tsx`).
- `useTranslation()` reads the seed as its initial state, so the
  first client render matches the server-rendered `<html lang dir>`.
- A new regression test (`lib/i18n.test.tsx`) pins the seed
  behaviour: ku, ar, tr, and the no-provider fallback all produce
  the expected first-render output.

### 2. `viewport` no longer blocks user zoom

`maximumScale: 1, userScalable: false` was a WCAG 1.4.4 violation
— iOS Safari respects the viewport and refuses pinch-to-zoom when
those are set, blocking low-vision users. Removed both, kept
`width=device-width, initialScale=1`.

### 3. `overflow-x: hidden` removed from `<html>`

It was on `html, body`. The body keeps it (so a single rogue child
can't scroll the document), but the `<html>` no longer suppresses
the scrollbar that would tell a developer a child is too wide.
This is the kind of mask-over-the-problem CSS that ships real bugs.

### 4. Admin orders: stacked cards on mobile, wrapping filter row

`app/admin/orders/page.tsx` had a 7-column table that overflowed the
viewport on phones (dates wrapped mid-month, action buttons got
squished). The fix:

- Under 640px, the page now renders a card list, one card per order.
  Each card has the order number, date, total, customer, items
  count, status select, and view link. Status and view controls get a
  `minHeight: 36px` to stay inside the WCAG 2.5.5 tap-target
  recommendation.
- The 6-pill filter row gets `flexWrap: 'wrap'`, and pill padding
  shrinks on mobile.
- The desktop table is wrapped in `overflow: 'auto'` (was `'hidden'`)
  so a narrow laptop can still scroll inside the table card rather
  than overflowing the document.
- `app/admin/orders/page.test.tsx` (7 tests) pins all three.

### 5. Admin products: stacked form rows + full-width modal

`app/admin/products/page.tsx` form had three hard-coded 1fr/1fr/1fr
grids (price, compare, quantity; category, type, status) and a
1fr/1fr digital-product row. Each grid is now 1fr on mobile so the
inputs get the full viewport width. The 600px modal is now
`calc(100vw - 24px)` on mobile, with a smaller padding and a
top-aligned mount so the form can scroll instead of being centred
off-screen. The product list table wrapper is also `overflow: auto`
now.

- `app/admin/products/page.test.tsx` (5 tests) pins the modal width
  and the row collapse.

### 6. Search bar: direction-aware padding, icon, and arrow

`components/SearchBar.tsx` had a hard-coded `left: 12px` for the
magnifying glass and an asymmetric `padding: '10px 16px 10px 40px'`
on the input. In RTL the icon should sit on the right and the text
should start on the right. The component now reads `direction` from
`useTranslation` and mirrors both. The hard-coded English placeholder
also goes through `t('nav.search', ...)`. The "view all results"
arrow flips to a left-pointing chevron in RTL.

- `components/SearchBar.test.tsx` (was 9, now 13) pins icon
  position, padding, and the arrow direction for both LTR and RTL.

### 7. Language switcher: dropdown anchors, row alignment, caret

`components/LanguageSwitcher.tsx` had `right: 0` on the dropdown
(pushed off the right edge in RTL when the trigger sat on the right
of the header) and `textAlign: 'left'` on every row (so Arabic names
were left-aligned inside an RTL page). Now:
- Dropdown anchor flips: `right: 0` in LTR, `left: 0` in RTL.
- Row `textAlign` flips with the document direction.
- The trigger caret flips to a left-pointing chevron in RTL.
- The check mark on the active language always sits on the trailing
  edge of the row.

- `components/LanguageSwitcher.test.tsx` (was 6, now 9) pins the
  dropdown anchor and row alignment in both directions.

### 8. `useTranslation` return-shape mock fix

`components/CurrencyPicker.test.tsx` was mocking `useTranslation` as
returning an array `['en', () => {}]`, but the real hook returns
`{ t, language, direction, changeLanguage, languages }`. The mock
worked because the picker never destructures an array form, but it
was a landmine: a future refactor that broke the destructuring
shape would still pass this test. The mock now mirrors the real
shape so the test catches a hook-signature regression.

## Issues NOT fixed in this pass (logged for follow-up)

These are real responsive issues but out of scope for "test
responsiveness" — they're either:
- In components I didn't want to touch in this turn (the cookie
  banner §8, the announcement bar copy);
- Stylistic improvements that need a design pass (text wrapping in
  long product names on mobile);
- A different kind of work (translating every hard-coded English
  string in the app — that's the multi-locale pass, not a responsive
  fix).

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | All admin pages | Sidebar's "View Store" + Logout buttons don't have a `minHeight: 44px` for tap targets | **Fixed** in commit 3cf36b4 (36px) |
| 2 | `components/AppShell.tsx` | The `minHeight: 'calc(100vh - 64px - 200px)'` reservation uses a fixed 200px footer that breaks for tall footers (e.g. 6 columns × 12 links on a 1024×600 screen) | **Fixed** in commit 3cf36b4 (replaced with `flex: 1 0 auto` on `<main>`) |
| 3 | All admin pages | The dark sidebar `backgroundColor: '#1a1a2e'` and white text are not dark-mode aware (admin opts out of theme, but the *admin's own* dark mode would be useful) | Open. Genuine product decision, not a responsive fix. |
| 4 | `app/p/[slug]/page.tsx` | Not a real page (redirect dispatcher) — but the legacy URL still bypasses the layout's mobile check; not currently an issue, worth a glance later | Open. False alarm. |
| 5 | `app/products/[slug]/ProductView.tsx` | The "Add to cart" button's `position: 'sticky'` is not mobile-tuned; on small phones the button can overlap the bottom of the description text | **Fixed** in commit 3cf36b4 — the actual sticky element was the cart order summary, not the add-to-cart button (which is not sticky). The cart/checkout sticky summaries are now `position: static` on mobile, `sticky` on desktop. |
| 6 | `app/checkout/CheckoutView.tsx` | The "Place order" sticky bar is also not mobile-tuned; same overlap risk | **Fixed** in commit 3cf36b4 (same fix as #5 — sticky summary, not the place-order button) |
| 7 | Most components | RTL: `▶`, `▼`, `→`, `←` arrows are inlined in many places, not all are direction-aware. The audit fixed the most visible ones (header, search bar, language switcher) but a full sweep needs a designer's call on which arrows are "directional" vs "stylistic" | **Fixed** in commit f8ee725 via the new `<DirectionArrow kind="..." />` component for all clear-cut directional arrows (Back, Next, Continue, View, Manage, Previous). Decorative arrows in marketing copy still need a designer. |
| 8 | `app/admin/appearance/page.tsx` | Uses `useIsMobile` already, but several preview blocks inside the builder are fixed-width | **Audited, no fix needed** — the appearance page's live preview already uses `isMobile ? 'static' : 'sticky'`, and the home builder has no fixed-width preview blocks. The audit's claim was wrong. |

## Other follow-up (added in "fix everything" pass)

While doing the "fix everything" pass, I also fixed these that
weren't on the original audit but came up while reading the code:

- **1fr/1fr form rows on 12+ pages** (commit c7d581b). The audit
  flagged two pages (orders, products); the same pattern existed
  in 12 more files (coupons, gift-cards, inventory/warehouses,
  menus, products variants, shipping, tax, register, returns,
  account, account/addresses, admin/analytics, admin/appearance).
  All now use `isMobile ? '1fr' : '1fr 1fr'`.
- **Fixed-width modals on 5 admin pages** (commit 4bf7433). The
  coupons/inventory/menus/shipping/tax pages each had a 400-500px
  modal that clipped on mobile. Same `calc(100vw - 24px)` + smaller
  padding pattern as the products/categories modals.
- **AccountShell sidebar caret RTL flip** (commit 3cf36b4). The
  mobile menu trigger's `▲/▼` was LTR-only; now flips per direction.

## Test counts before / after

| Suite | Before audit (commit `731229a`) | After audit (commit `6829338`) | After "fix everything" (HEAD) | Net new |
|---|---:|---:|---:|---:|
| `apps/web` lib | 188 | 198 | 198 | +10 (`lib/serverLocale.test.ts`) |
| `apps/web` components | 250 | 273 | 279 | +29 (4 SSR seed + 4 SearchBar RTL + 3 LanguageSwitcher RTL + 7 admin orders + 5 admin products + 2 admin categories + 4 DirectionArrow) |
| **Total** | **438** | **471** | **477** | **+39** |

The 17 API unit tests and 11 currency integration tests still pass on
mock prisma. The 41 API unit tests that need the real generated
Prisma client can't run in this sandbox (`binaries.prisma.sh` is
SSL-blocked) — that constraint is unchanged from the previous
session, not introduced by this work.

## Notes for the next pass

- The cookie-vs-localStorage split for i18n is half-done: the server
  reads the cookie (when present), the client still reads
  localStorage on mount. A future i18n rewrite that writes both
  will get server-side `<html lang dir>` for free.
- The 200px footer-height reservation in AppShell is a magic
  number — once the footer becomes data-driven (admin can pick
  which columns render), this will need to become measured.
- The admin products modal uses `minHeight: 100vh` on mobile to
  mimic a full-screen sheet, but on a phone with the on-screen
  keyboard up the field of view is shorter than the form. A
  `visualViewport` listener would be the right next step, but
  it's out of scope here.
