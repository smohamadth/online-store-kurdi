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
**Status:** partial. LayoutRenderer still stands in for ProductCard/HeroGallery, but product tiles can show an image, video uses `url`/`src`, quotes/testimonials honour Home-builder field names.

### 4. Rich Studio blocks never appear on the live home page
**Status:** fixed. `BLOCK_TO_SECTION` covers every `BlockType`; quote/video/gallery keys are normalised. Live home still uses DB sections (P0.1); this map is for studio preview / future overlay.

### 5. Seeded hero config is a different shape from the editor
**Status:** fixed. Seed writes `config.hero`. `heroOptionsFromSectionConfig` still understands the old root `autoplay`/`intervalMs`/`medium` rows.

---

## P1 — real functional bugs

### 6. Featured section ignores its own limit and is not “featured”
**Status:** partial. Home builder has a limit slider; HomeView uses `featuredProductsToShow`. `GET /products/featured` ranks by review count then recency (Product has no `isFeatured` column).

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
**Status:** partial. Home builder can add newsletter, dealCountdown, **cta, steps, pricing** (HomeView renders them). Hero/categories remain singletons. Studio still has extra chrome-only types (productDetail, blogList, …).

### 17. Niche theme heroes ignore most hero options
**Status:** fixed. Home builder disables autoplay/arrows/dots when the active theme is Bold/Dawnlight/Minimal/Pulse, or when layout is not slideshow. Copy explains the limit.

### 18. No live storefront preview from the Home builder
**Status:** partial. Home builder embeds the real `/` in Desktop/Tablet/Phone frames (refresh after save). Unsaved drafts are not in the iframe. Theme Studio preview is still LayoutRenderer (P0.3).

### 19. No undo / versioning
**Status:** partial. Dirty blocks have **Discard changes** (last saved snapshot). Reset still wipes everything. No history / versions.

### 20. Reorder can drop sections not in the payload
**Status:** fixed. Omitted ids are appended after the payload (previous relative order), so leftover `sortOrder` values cannot interleave.

### 21. `config` is `z.record(z.any())` — unbounded
**Status:** fixed. Writes cap serialized config at 64KB; `scrubBuilderConfig` slices list fields to 40 items and HTML strings to 20k chars.

### 22. Image uploads in builder use mixed folders
**Status:** fixed. Gallery, logos, and lookbook all upload to the allowlisted `categories` bucket (`banners` was not a valid folder).

### 23. RTL / physical CSS in builder UI
**Status:** partial. Rich-text / custom alignment uses `start`/`center`/`end` (storefront maps start→logical start, end→end). Studio preview-mode active button uses `--brand`.

### 24. `getFeaturedProducts` in `lib/api.ts` uses a second API client (`localhost` fallback)
**Status:** fixed. `ApiClient` uses `CLIENT_API_BASE` (same-origin `/api` on loopback).

### 25. Theme Studio token editor is a subset
**Status:** partial. Editor includes heading weight, container width, products per row, card shadow, button radius. `show*` toggles stay out (they no longer hide Home blocks — P1.8).

### 26. Installing a theme zip cannot add React sections
**Status:** documented in Theme Studio header (zip = tokens + layout JSON only). Data-only by design (`KNOWN_GAPS` §13.1).

### 27. Home builder “Restore default” vs “deleted keys”
**Status:** not a live bug on GET. Public GET does not re-seed. Reset still restores the full seed (including deleted keys) — that is the restore action. Tooltip on the button says so.

---

## P3 — polish / tests to add when fixing

- No `beforeunload` when Home builder `dirty` is set. **Fixed** (P1.9).
- Drag handle is mouse-only (arrows exist — OK); drop hint on the list footer can target the last card.
- Studio `loadThemes` N+1 fetches (list keys then GET each). **Fixed** — `GET /theme-studio/themes` returns full configs; UI still accepts the old keys array.
- Studio `LayoutRenderer` product cards are not links (`/products/:slug`). **Fixed** (also category `/category/:slug`, blog `/blog/:slug`).
- Comparison editor `true`/`false` strings vs booleans. **Fixed** — renderer also treats real booleans as ✓/✕.
- Video autoplay without muted. **Fixed** — checking Autoplay also sets muted and disables the mute checkbox; `VideoSection` already forces mute on autoplay.
- Tests to add: hero seed shape vs `heroOptionsFromConfig`; `blockToHomeSection` coverage for every `BlockType`; HomeView does not drop featured remainder; bundled theme PUT returns 403 and UI shows it; `layouts.home` vs DB sections switch.

---

## Suggested order for the next turns

1. Remaining P2 (preview, undo, niche hero controls, token editor).
2. Tests listed under P3.

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
