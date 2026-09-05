# Store builder — bugs and holes

Working list for the **home page builder** (Admin → Appearance → Home) and **Theme Studio** (`/admin/theme-studio`).  
Not the whole platform (see `KNOWN_GAPS.md` for payments, email, etc.).

**How to use:** pick the next P0/P1 item, fix it, tick it here. Do not “fix” items marked *by design* without an explicit product decision.

---

## Architecture (why so many bugs)

There are **two independent layout systems**. Live home always uses Home sections; Studio `layouts.home` is a canvas only.

| System | Admin UI | Persistence | Storefront |
|---|---|---|---|
| **Home sections** | Appearance → Home (`HomeBuilder.tsx`) | `HomeSection` rows in the DB | `HomeView` via `pickStorefrontHomeSections` |
| **Theme Studio layouts** | `/admin/theme-studio` | `theme.json` `layouts.<page>` on disk | Canvas / preview only for home; listing/PDP chrome unless native blocks are present |

Legacy `theme.show*` tokens no longer hide builder-visible Home blocks.

---

## P0 — broken or two systems fighting

### 1. Theme Studio home layout silently replaces the Home builder
**Status:** fixed. Live home always uses `HomeSection` rows via `pickStorefrontHomeSections`. Studio `layouts.home` stays a studio canvas only.

### 2. Saving a bundled theme in Theme Studio always fails
**Status:** fixed. Save/Delete disabled for platform keys (`isPlatformBundledTheme`); copy tells the admin to duplicate via New theme. API still refuses PUT.

### 3. Studio preview is not the storefront
**Status:** partial. Canvas still uses LayoutRenderer. Home tab also embeds the live `/?homePreview=` iframe. Product tiles, video `url`, quote/testimonial aliases improved.

### 4. Rich Studio blocks never appear on the live home page
**Status:** fixed. `BLOCK_TO_SECTION` covers every `BlockType`. Live home still uses DB sections (P0.1).

### 5. Seeded hero config is a different shape from the editor
**Status:** fixed. Seed writes `config.hero`. `heroOptionsFromSectionConfig` understands legacy root keys. Covered by `heroOptions.test.ts`.

---

## P1 — real functional bugs

### 6. Featured section ignores its own limit and is not “featured”
**Status:** fixed (needs migrate). Limit slider + `featuredProductsToShow`. `Product.isFeatured` + admin checkbox. `GET /products/featured` prefers flagged SKUs, else review-count then recency.

### 7. Deal countdown / gallery / banners link to `/deals` (no route)
**Status:** not a bug. `apps/web/app/deals` exists.

### 8. Dual visibility: token toggles override the builder
**Status:** fixed. `isHomeSectionVisible` uses only `HomeSection.isVisible`.

### 9. Theme Studio cannot edit bundled themes, cannot persist drafts across Save correctly
**Status:** fixed. Successful Save merges drafts then `setDrafts({})`. `beforeunload` when studio drafts or HomeBuilder dirty rows exist.

### 10. HTML / URL sanitisation is incomplete on builder content
**Status:** fixed. `scrubBuilderConfig` on Home writes and Theme Studio `saveTheme`.

### 11. `GET /api/home-sections` writes on read
**Status:** fixed. Public GET is read-only.

### 12. Comparison “highlighted column” off-by-one
**Status:** not a bug. 1-based `highlight`.

### 13. Testimonials field names differ between Home builder and Studio renderer
**Status:** fixed. `normalizeStudioConfig` + LayoutRenderer aliases.

### 14. Featured/new/trending Studio blocks on non-home pages replace real chrome
**Status:** fixed. `studioLayoutReplacesChrome`.

### 15. `fetchThemeCatalog` uses `NEXT_PUBLIC_API_URL` / localhost, not `CLIENT_API_BASE`
**Status:** fixed.

---

## P2 — holes / incomplete product

### 16. Two “add block” palettes that don’t match
**Status:** fixed enough. Home builder + Studio `paletteForPage` (chrome types only on matching pages). Hero/categories remain singletons on Home.

### 17. Niche theme heroes ignore most hero options
**Status:** fixed. Controls disabled for Bold/Dawnlight/Minimal/Pulse.

### 18. No live storefront preview from the Home builder
**Status:** partial. Real `/` iframe at device widths. Unsaved drafts are not in the iframe (honest). Studio home also has a live iframe.

### 19. No undo / versioning
**Status:** fixed enough. Discard + session Undo + **Saved versions** (localStorage, last 20 published snapshots). Restoring marks rows dirty until saved. Not a server-side audit log.

### 20. Reorder can drop sections not in the payload
**Status:** fixed.

### 21. `config` is `z.record(z.any())` — unbounded
**Status:** fixed. 64KB cap + list/HTML slices.

### 22. Image uploads in builder use mixed folders
**Status:** fixed. Allowlisted `categories` bucket.

### 23. RTL / physical CSS in builder UI
**Status:** partial. Storefront alignment uses start/end. Admin chrome stays LTR (by design for the English admin shell).

### 24. `getFeaturedProducts` in `lib/api.ts` uses a second API client
**Status:** fixed. `CLIENT_API_BASE`.

### 25. Theme Studio token editor is a subset
**Status:** fixed enough. Colours, type, radius, container, products per row, shadow, announcement, custom CSS. `show*` home toggles stay out (P1.8).

### 26. Installing a theme zip cannot add React sections
**Status:** by design (`KNOWN_GAPS` §13.1). Documented in Studio header.

### 27. Home builder “Restore default” vs “deleted keys”
**Status:** not a live bug. Reset is the restore action.

---

## P3 — polish / tests

- `beforeunload` when dirty. **Fixed**.
- Drag handle mouse-only (arrows exist — OK).
- Studio themes list no N+1. **Fixed**.
- LayoutRenderer product/category/blog links. **Fixed**.
- Comparison booleans. **Fixed**.
- Video autoplay muted. **Fixed**.
- Tests: `heroOptions.test.ts`, `homeMapping.test.ts` (`pickStorefrontHomeSections`, every `BlockType`), `featuredGrid.test.ts`, `homeHistory.test.ts`, featured GET fallback.

---

## Files (cheat sheet)

| Area | Path |
|---|---|
| Home builder UI | `apps/web/components/HomeBuilder.tsx` |
| Home versions | `apps/web/lib/homeHistory.ts` |
| Home API | `apps/api/src/modules/home/home.routes.ts` |
| Storefront home | `apps/web/app/HomeView.tsx` |
| Studio UI | `apps/web/app/admin/theme-studio/page.tsx` |
| Layout model | `apps/web/lib/layouts/` |
| Featured | `GET /products/featured`, `Product.isFeatured` |
