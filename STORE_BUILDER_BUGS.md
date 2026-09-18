# Store builder — bugs and holes

Working list for the **home page builder** (Admin → Appearance → Homepage) and **Theme Studio** (`/admin/theme-studio`).
Not the whole platform (see `KNOWN_GAPS.md` for payments, email, etc.).

**How to use:** pick the next P0/P1 item, fix it, tick it here. Do not “fix” items marked *by design* without an explicit product decision.

---

## Architecture (why so many bugs)

There are **two explicit persistence scopes**. Live home uses DB Home sections; Studio `layouts.home` is a reusable ordered template. Copy it only with **Replace homepage from theme**. See [the design workflow](docs/DESIGN_WORKFLOW.md).

| System | Admin UI | Persistence | Storefront |
|---|---|---|---|
| **Home sections** | Appearance → Homepage (`HomeBuilder.tsx`) | `HomeSection` rows in the DB | `HomeView` via `pickStorefrontHomeSections` |
| **Theme Studio layouts** | `/admin/theme-studio` | `theme.json` `layouts.<page>` on disk | Saved Home template, copied explicitly to live rows; other-page grids with native-chrome guards |

Legacy `theme.show*` tokens no longer hide builder-visible Home blocks.

---

## P0 — broken or two systems fighting

### 1. Theme Studio home layout silently replaces the Home builder
**Status:** fixed. Live home always uses `HomeSection` rows via `pickStorefrontHomeSections`. Studio `layouts.home` stays a reusable template until explicitly copied to the store.

### 2. Saving a bundled theme in Theme Studio always fails
**Status:** fixed. Save/Delete disabled for platform keys (`isPlatformBundledTheme`); copy tells the admin to duplicate via New theme. API still refuses PUT.

### 3. Studio preview is not the storefront
**Status:** fixed. Home preview column paints `HomeSectionStack` from `layoutToHomeSections` + `studioHomeMerch`. Preview `dir` follows `features.rtl`. Live iframe for home, products, and blog. Canvas drop-zone stays LayoutRenderer for grid coordinates. Listing/PDP Preview uses LayoutRenderer.

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
**Status:** fixed enough. Real `/` iframe at device widths. Unsaved edits write a same-origin sessionStorage draft that `HomeView` only reads when `homePreview` is set; the iframe refreshes after a short pause. Save still publishes.

### 19. No undo / versioning
**Status:** fixed enough. Discard + session Undo + **Saved versions** (localStorage, last 20 published snapshots). Restoring marks rows dirty until saved. Not a server-side audit log.

### 20. Reorder can drop sections not in the payload
**Status:** fixed.

### 21. `config` is `z.record(z.any())` — unbounded
**Status:** fixed. 64KB cap + list/HTML slices.

### 22. Image uploads in builder use mixed folders
**Status:** fixed. Allowlisted `categories` bucket.

### 23. RTL / physical CSS in builder UI
**Status:** fixed enough. Storefront CustomSection maps left/right to start/end. Admin chrome stays LTR.

### 24. `getFeaturedProducts` in `lib/api.ts` uses a second API client
**Status:** fixed. `CLIENT_API_BASE`.

### 25. Theme Studio token editor is a subset
**Status:** fixed enough. Colours, font stack select, type, radius, container, products per row, shadow, announcement, custom CSS, RTL / dark-mode-ready flags. `show*` home toggles stay out (P1.8).

### 26. Installing a theme zip cannot add React sections
**Status:** by design (`KNOWN_GAPS` §13.1). Documented in Studio header.

### 27. Home builder “Restore default” vs “deleted keys”
**Status:** not a live bug. Reset is the restore action.

### 28. Replace the homepage from a saved theme
**Status:** fixed and hardened. `POST /api/home-sections/apply-theme` validates the entire saved `layouts.home`, then replaces HomeSection rows in a transaction. Missing/empty/invalid templates are errors, not implicit platform defaults. The shared **Replace homepage from theme** control is used in Appearance, Homepage and Studio, requires saved/discarded drafts, and confirms that styling stays unchanged. Reset to defaults is a separate operation.

### 29. Consistent design workflow and draft safety
**Status:** fixed. Appearance no longer exposes obsolete home master switches; the
announcement remains independent. Active and pending theme choices are distinct,
and Appearance Save never writes homepage content. Studio Home uses the same
full-width section rendering as the live storefront; persisted reorder changes
row positions. Other pages retain grids. Metadata-only and per-page drafts block
replacement until saved; duplication includes those drafts. Sidebar links,
browser unload, local tab exits and theme switches protect pending edits.

Visibility/reorder writes in Homepage preserve draft wording. Load failures cannot
be mistaken for an empty editable homepage. The Studio saved-store iframe no
longer consumes stale Home editor session data; empty Home drafts are valid and
are cleared on exit. Optional history-storage failures cannot turn a successful
API save into an error. Regression tests cover these boundaries; native SQL
rollback/isolation remains a real-database check, not an in-memory mock guarantee.

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

---

## Beyond the builder

A project-wide audit (payments, downloads, auth, money/stock math, deployment)
is recorded separately in [`docs/AUDIT_2026-09.md`](docs/AUDIT_2026-09.md).
