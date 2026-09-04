# Store builder — bugs and holes

Working list for the **home page builder** (Admin → Appearance → Home) and **Theme Studio** (`/admin/theme-studio`).  
Not the whole platform (see `KNOWN_GAPS.md` for payments, email, etc.).

**How to use:** pick the next P0/P1 item, fix it, tick it here. Do not “fix” items marked *by design* without an explicit product decision.

---

## Architecture (why so many bugs)

There are **two independent layout systems** that both claim to own the storefront:

| System | Admin UI | Persistence | Storefront |
|---|---|---|---|
| **Home sections** | Appearance → Home (`HomeBuilder.tsx`) | `HomeSection` rows in the DB | `HomeView` maps types → real components |
| **Theme Studio layouts** | `/admin/theme-studio` | `theme.json` `layouts.<page>` on disk | If `layouts.home` has blocks, **HomeView ignores DB sections** |

Plus a third layer: **legacy token toggles** (`theme.showTrustBar`, `showFeatured`, …) still hide sections even after the builder made them visible.

Result: an admin can “save” a home page that never appears, or a Studio layout that looks nothing like the live store.

---

## P0 — broken or two systems fighting

### 1. Theme Studio home layout silently replaces the Home builder
**Status:** fixed. Live home always uses `HomeSection` rows via `pickStorefrontHomeSections`. Studio `layouts.home` stays a studio canvas only.

### 2. Saving a bundled theme in Theme Studio always fails
**Where:** `themeStudio.service.ts` `saveTheme` / `isBundledTheme` (`.bundled` marker + `default`).  
**Bug:** The UI lists Bold/Minimal/Dawnlight/Pulse and offers **Save theme**. The API refuses overwrites of bundled keys. The merchant thinks the studio is broken.  
**Fix direction:** Duplicate-on-edit (force a new key) or disable Save/Delete on bundled themes with copy that says “duplicate first”.

### 3. Studio preview is not the storefront
**Where:** `theme-studio/page.tsx` renders `<LayoutRenderer layout={layout} data={{}} />`; `layouts/render.tsx` BLOCK_RENDERERS.  
**Bugs:**
- Preview gets **empty `data`**, so product/category/hero blocks show placeholders or nothing.
- `LayoutRenderer` is a **toy** (name-only cards, no `ProductCard`, no `HeroGallery`, no add-to-cart). HomeView uses a *different* renderer (`renderSection` + `ThemeSectionRenderer`).
- CSS vars in the studio preview (`--primary`, `--bg`, `--text`) **do not match** storefront tokens (`--brand`, `--body-bg`, `--body-text`). Preview colours lie.
**Fix direction:** One renderer path for home (reuse `HomeView.renderSection` / `blockToHomeSection` + live banners/products), and map tokens through `themeToCssVars`.

### 4. Rich Studio blocks never appear on the live home page
**Status:** fixed. `BLOCK_TO_SECTION` covers every `BlockType`; quote/video/gallery keys are normalised. Live home still uses DB sections (P0.1); this map is for studio preview / future overlay.

### 5. Seeded hero config is a different shape from the editor
**Where:** `home.defaults.ts` seeds `{ autoplay, intervalMs, height: 'medium' }` at **config root**. HomeBuilder writes `{ hero: { layout, height, intervalSec, autoPlay } }`. `heroOptionsFromConfig` only reads **`config.hero`**.  
**Bug:** Fresh installs never apply seeded autoplay/height. `'medium'` is not even a valid `HeroHeight` (`compact|standard|tall`).  
**Fix direction:** Seed `config.hero` in the new shape; optionally migrate old rows in `fromRow`.

---

## P1 — real functional bugs

### 6. Featured section ignores its own limit and is not “featured”
**Where:** `HomeView` featured case; `GET /api/products/featured` (latest active products, not a featured flag). Builder `config.limit` is unused. Grid **drops remainder products** so the last row is full (`Math.floor(n/cols)*cols`) — a 5-product shop with 4 columns shows **4**.  
**Fix direction:** Honour `config.limit`; stop dropping leftovers; if “featured” is a real flag, filter on it (or rename the section).

### 7. Deal countdown / gallery / banners link to `/deals` (no route)
**Where:** seed + `HomeBuilder` defaults `buttonHref: '/deals'`; gallery “On sale” → `/deals`. There is `apps/web/app/deals`? (check) — if missing, those CTAs 404.  
**Fix direction:** Point at `/products?onSale=1` (or whatever the filter query is) or add a real deals page.

### 8. Dual visibility: token toggles override the builder
**Where:** `HomeView.legacyHidden`. Appearance “Sections” checkboxes (`showTrustBar` etc.) hide blocks even when Home builder `isVisible` is on. Studio home path also calls `legacyHidden`.  
**Fix direction:** One source of truth (section rows). Treat token flags as deprecated or sync them on save.

### 9. Theme Studio cannot edit bundled themes, cannot persist drafts across Save correctly
**Where:** `save()` merges `drafts` into `current.layouts` but **does not clear `drafts`**. Switching theme resets drafts; switching **page** keeps them (good) but unsaved token edits live on `current` with **no dirty flag / no beforeunload**.  
HomeBuilder has the same hole: dirty rows, no `beforeunload`.  
**Fix direction:** Dirty state + confirm on navigate; after successful save, set `current.layouts` and `setDrafts({})`.

### 10. HTML / URL sanitisation is incomplete on builder content
**Where:** `home.routes.ts` `scrubConfig` only sanitises `richText`/`custom` `html`. FAQ answers, quotes, lookbook copy, video `url`/`poster`, gallery `linkUrl`, comparison cells are stored raw.  
Studio `saveTheme` does **not** run `sanitizeRichText` at all (`KNOWN_GAPS` §13.5). `LayoutRenderer` then `dangerouslySetInnerHTML`.  
CTA `buttonHref` and image `src` are not scheme-checked (javascript:).  
**Fix direction:** Sanitize every HTML field on write; allowlist http(s)/relative URLs for href/src (same as banners/menus).

### 11. `GET /api/home-sections` writes on read
**Where:** public `GET /` calls `ensureSeeded()` which **inserts** missing keys. First anonymous homepage hit mutates the DB. Comment in `home.defaults.ts` says deleting a block does not come back — **true for delete**, but **hiding ≠ delete**; a new seed key added in a platform upgrade **reappears** on the next GET.  
**Fix direction:** Seed only from admin reset / migrate, not from public GET.

### 12. Comparison “highlighted column” off-by-one
**Where:** HomeBuilder select: value `0` = None, `i+1` = column i. Default seed `highlight: 2`. Storefront `ComparisonTable` likely treats `highlight` as 0-based index. Easy to highlight the wrong column or none.  
**Fix direction:** One convention (0-based index or `null`) and tests.

### 13. Testimonials field names differ between Home builder and Studio renderer
**Where:** Home builder items use `{ name, role, rating, text }`. `LayoutRenderer` testimonials read `t.author`. Quote: Home uses `cfg.quote`; Studio quote block uses `config.text`. Gallery: Home uses `image`; Studio gallery looks at `src`/`url`. Logo: Home `logos` vs Studio `logoStrip`.  
**Bug:** Copy-paste / mapping produces empty blocks.  
**Fix direction:** Normalize in `blockToHomeSection` or share one item schema.

### 14. Featured/new/trending Studio blocks on non-home pages replace real chrome
**Where:** `KNOWN_GAPS` §13.3 — a products-page layout with only a hero **hides the filter sidebar and pagination**. `productDetail` renderer’s “Add to cart” is a **div**, not a button (dead). `categoryGrid` reads `d.products` not categories.  
**Fix direction:** Page-native blocks must call the real page widgets, or refuse to replace chrome unless `productList`/`pageContent` is present.

### 15. `fetchThemeCatalog` uses `NEXT_PUBLIC_API_URL` / localhost, not `CLIENT_API_BASE`
**Where:** `themeRuntime.ts` `API_URL`. Browser on a preview host cannot reach `localhost:3001`. Installed themes never overlay.  
**Fix direction:** Use `CLIENT_API_BASE` / relative `/api/themes` like the rest of the storefront.

---

## P2 — holes / incomplete product

### 16. Two “add block” palettes that don’t match
Home builder `CREATABLE_TYPES` ≠ Studio `BLOCK_TYPES`. Cannot add a second **hero** from Home builder (intentional singleton) but Studio can add many heroes. Cannot add **newsletter** / **dealCountdown** from Home “Add block” (only seeded). Cannot add **cta/pricing/steps** from Home builder at all.

### 17. Niche theme heroes ignore most hero options
HomeBuilder copy admits Bold/Dawnlight/Minimal/Pulse only honour single/split. Slideshow autoplay/arrows/dots are dead for those themes. No UI that disables the dead controls when a niche theme is active.

### 18. No live storefront preview from the Home builder
Edits require opening `/` in another tab. No device frames. Theme Studio preview is the wrong renderer (P0.3).

### 19. No undo / versioning
Reset wipes **all** home sections (`deleteMany` + seed). No per-block revert, no history. Studio delete of a custom theme is permanent (OK) but bundled duplicate flow is missing (P0.2).

### 20. Reorder can drop sections not in the payload
`PUT /reorder` updates only ids in `order`. If the client sends a partial list, omitted rows keep old `sortOrder` and interleave. HomeBuilder sends the full list today — still a footgun.

### 21. `config` is `z.record(z.any())` — unbounded
A huge gallery / FAQ JSON is free DB bloat (analytics already learned this lesson). No max items, no max HTML length.

### 22. Image uploads in builder use mixed folders
Gallery → `folder="banners"`; logos/lookbook → `folder="categories"`. Confusing in MinIO and easy to hit allowlist bugs.

### 23. RTL / physical CSS in builder UI
HomeBuilder `text-align` left in richText align select is **content** (storefront should use `start`). Studio preview button active uses `--primary` not `--brand`.

### 24. `getFeaturedProducts` in `lib/api.ts` uses a second API client (`localhost` fallback)
Inconsistent with `http.ts` / `CLIENT_API_BASE`. Preview/sandbox breakage class.

### 25. Theme Studio token editor is a subset
Only some colours + font/size/radius. Missing `productsPerRow`, `cardShadow`, `show*` toggles, `containerWidth`, `headingWeight` — so Studio themes never match bundled density.

### 26. Installing a theme zip cannot add React sections
Data-only by design (`KNOWN_GAPS` §13.1). Hole: merchants cannot get a custom Hero without a platform rebuild. Document in the Studio UI, not only in docs.

### 27. Home builder “Restore default” vs “deleted keys”
Reset restores seed. `ensureSeeded` on GET re-inserts **new** platform keys after an upgrade, which can surprise a carefully emptied page.

---

## P3 — polish / tests to add when fixing

- No `beforeunload` when Home builder `dirty` is set.
- Drag handle is mouse-only (arrows exist — OK); drop hint can miss last card.
- Studio `loadThemes` N+1 fetches (list keys then GET each).
- Studio `LayoutRenderer` product cards are not links (`/products/:slug`).
- Comparison editor `true`/`false` strings vs booleans.
- Video autoplay without muted (Home builder notes this; still a checkbox combo).
- Tests to add: hero seed shape vs `heroOptionsFromConfig`; `blockToHomeSection` coverage for every `BlockType`; HomeView does not drop featured remainder; bundled theme PUT returns 403 and UI shows it; `layouts.home` vs DB sections switch.

---

## Suggested order for the next turns

1. **P0.1 + P0.4** — one home rendering path (DB sections always, or explicit switch); map all block types.
2. **P0.2 + P1.9** — bundled themes read-only; dirty/save UX.
3. **P0.3 + P1.15** — preview = storefront renderer + correct API base/tokens.
4. **P1.5** — hero config migration.
5. **P1.6 + P1.7** — featured limit / leftover cards; `/deals` links.
6. **P1.8** — kill or sync legacy `show*` flags.
7. **P1.10** — sanitize HTML/URLs on all builder writes.
8. Remaining P2.

---

## Files (cheat sheet)

| Area | Path |
|---|---|
| Home builder UI | `apps/web/components/HomeBuilder.tsx` |
| Home client | `apps/web/lib/homeSections.ts` |
| Home API | `apps/api/src/modules/home/home.routes.ts`, `home.defaults.ts` |
| Storefront home | `apps/web/app/HomeView.tsx` |
| Theme sections | `apps/web/lib/themeSections.tsx`, `themeSectionRenderer.tsx` |
| Studio UI | `apps/web/app/admin/theme-studio/page.tsx` |
| Studio API | `apps/api/src/modules/themeStudio/` |
| Layout model | `apps/web/lib/layouts/types.ts`, `edit.ts`, `render.tsx`, `homeMapping.ts` |
| Runtime catalog | `apps/web/lib/themeRuntime.ts` |
| Hero options | `apps/web/lib/heroOptions.ts` |
| Existing “honest limits” | `KNOWN_GAPS.md` §13 |
