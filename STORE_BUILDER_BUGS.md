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
**Status:** fixed. Save/Delete disabled for platform keys (`isPlatformBundledTheme`); copy tells the admin to duplicate via New theme. API still refuses PUT.

### 3. Studio preview is not the storefront
**Status:** partial. Preview now gets `studioLayoutData()` (sample products/categories) and `studioTokenStyle` (`--brand`/`--body-bg` plus aliases). LayoutRenderer is still a lightweight stand-in, not ProductCard/HeroGallery.

### 4. Rich Studio blocks never appear on the live home page
**Status:** fixed. `BLOCK_TO_SECTION` covers every `BlockType`; quote/video/gallery keys are normalised. Live home still uses DB sections (P0.1); this map is for studio preview / future overlay.

### 5. Seeded hero config is a different shape from the editor
**Status:** fixed. Seed writes `config.hero`. `heroOptionsFromSectionConfig` still understands the old root `autoplay`/`intervalMs`/`medium` rows.

---

## P1 — real functional bugs

### 6. Featured section ignores its own limit and is not “featured”
**Status:** partial. `featuredProductsToShow` honours `config.limit` and no longer drops leftover cards. `GET /products/featured` is still “latest”, not a featured flag.

### 7. Deal countdown / gallery / banners link to `/deals` (no route)
**Status:** not a bug. `apps/web/app/deals` exists (`DealsView.tsx`).

### 8. Dual visibility: token toggles override the builder
**Status:** fixed. `isHomeSectionVisible` uses only `HomeSection.isVisible`. Theme `show*` tokens no longer hide builder-visible blocks.

### 9. Theme Studio cannot edit bundled themes, cannot persist drafts across Save correctly
**Status:** fixed. Successful Save merges drafts then `setDrafts({})`. `beforeunload` when studio drafts or HomeBuilder dirty rows exist. Bundled themes remain read-only (P0.2).

### 10. HTML / URL sanitisation is incomplete on builder content
**Status:** fixed. `scrubBuilderConfig` sanitises html/quote/description/faq answers/testimonials and blanks unsafe href/src on Home writes and Theme Studio `saveTheme`.

### 11. `GET /api/home-sections` writes on read
**Status:** fixed. Public GET and developers bootstrap are read-only. Seed via admin reset and `prisma db seed`.

### 12. Comparison “highlighted column” off-by-one
**Status:** not a bug. Builder and `ComparisonTable` both use **1-based** `highlight` (`0`/null = none). Seed `highlight: 2` is the second column. Covered by tests.

### 13. Testimonials field names differ between Home builder and Studio renderer
**Status:** fixed. `normalizeStudioConfig` fills both aliases (`name`/`author`, `quote`/`text`, `image`/`src`) and `LayoutRenderer` runs it before draw, so Home-builder JSON previews in Studio.

### 14. Featured/new/trending Studio blocks on non-home pages replace real chrome
**Status:** fixed. `studioLayoutReplacesChrome` keeps native listing/PDP/blog UI unless the layout includes `productList` / `categoryGrid` / `productDetail` / `blogList` / `blogPostBody`|`pageContent`. `categoryGrid` reads `d.categories`. PDP “Add to cart” is a `<button>` wired to `data.onAddToCart`.

### 15. `fetchThemeCatalog` uses `NEXT_PUBLIC_API_URL` / localhost, not `CLIENT_API_BASE`
**Status:** fixed. Catalog fetch uses `CLIENT_API_BASE` (same-origin `/api` on loopback).

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
**Status:** fixed. Omitted ids are appended after the payload (previous relative order), so leftover `sortOrder` values cannot interleave.

### 21. `config` is `z.record(z.any())` — unbounded
A huge gallery / FAQ JSON is free DB bloat (analytics already learned this lesson). No max items, no max HTML length.

### 22. Image uploads in builder use mixed folders
Gallery → `folder="banners"`; logos/lookbook → `folder="categories"`. Confusing in MinIO and easy to hit allowlist bugs.

### 23. RTL / physical CSS in builder UI
HomeBuilder `text-align` left in richText align select is **content** (storefront should use `start`). Studio preview-mode active button now uses `--brand` (partial).

### 24. `getFeaturedProducts` in `lib/api.ts` uses a second API client (`localhost` fallback)
**Status:** fixed. `ApiClient` uses `CLIENT_API_BASE` (same-origin `/api` on loopback).

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
<<<<<<< HEAD
- Studio `LayoutRenderer` product cards are not links (`/products/:slug`).
=======
- Studio `LayoutRenderer` product cards are not links (`/products/:slug`). **Fixed** (also category `/category/:slug`, blog `/blog/:slug`).
>>>>>>> 0f728bd (fix(builder): keep partial reorder, merch links, and browser-safe API)
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
