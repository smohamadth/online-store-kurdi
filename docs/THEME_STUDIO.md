# Theme Studio — reusable themes and page templates

**Appearance edits the running store. Studio edits reusable theme definitions.**
For the merchant-facing workflow, start with [DESIGN_WORKFLOW.md](DESIGN_WORKFLOW.md).

Studio supports colours, typography, spacing, theme metadata, an ordered homepage
template and grid layouts for other pages. Saving a definition is not the same
operation as applying its styling or replacing the merchant's homepage.

## 1. Data model and persistence boundaries

`apps/web/lib/layouts/types.ts` defines `PageLayout`, `LayoutBlock` and `PageKey`:

```ts
interface PageLayout {
  columns: number;
  gap: number;
  blocks: LayoutBlock[];
}

interface LayoutBlock {
  id: string;
  type: BlockType;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  config: Record<string, unknown>;
}

type PageKey = 'home' | 'products' | 'category' | 'product' | 'blog' | 'blogPost' | 'page';
```

**Home is special.** Its file format remains compatible with existing layouts,
but Studio normalizes it with `homeStackLayout`: one column, zero outer grid gap,
full-width blocks, sequential rows. Existing grid layouts are read in row/column
order, preserving block content. Moving a block updates its persisted row position,
not just its position in the array. Other page layouts keep their grids.

| Operation | Persistence | Does not modify |
| --- | --- | --- |
| Save appearance | `ThemeSettings` via `PUT /api/theme` | Live homepage rows, template definitions |
| Save this block / reorder / visibility | `HomeSection` via `/api/home-sections` | Theme definitions, active styling |
| Save theme | `theme.json` via `PUT /api/theme-studio/themes/:key` | Live homepage rows, appearance overrides |
| Replace homepage from theme | Transactional replacement of `HomeSection` rows | Active theme, colours, fonts |

Non-home layouts of the already-active theme take effect on those pages' next
load. For draft-only work on such layouts, edit an inactive copy.

## 2. Blocks

The registry and renderers live under `apps/web/lib/layouts/`.

- **Marketing:** `hero`, `promo`, `bannerStrip`, `trustBar`, `features`,
  `categories`, `featured`, `newArrivals`, `trending`, `dealCountdown`,
  `testimonials`, `stats`, `gallery`, `richText`, `custom`, `newsletter`.
- **Reusable content:** `cta`, `video`, `image`, `textImage`, `divider`, `faq`,
  `steps`, `logoStrip`, `pricing`, `quote`, `iconsGrid`.
- **Page-native:** `productDetail`, `productList`, `categoryGrid`, `blogList`,
  `blogPostBody`, `pageContent`.

The palette is scoped to the current page. `configFieldsFor` supplies structured
inputs, with a JSON field for uncommon configuration. Template preview data is
sample merchandise, not the merchant's actual products/banners. Some banner-based
sections therefore use sample banner titles rather than a block's generic title.

## 3. Authoring and saving

Route: `/admin/theme-studio` (admin/manager).

- Create a new theme or select an existing definition from the disk catalog.
- Bundled themes are read-only on disk. Duplicate one to save changes.
- Duplication copies current tokens, feature flags, section references and the
  merged drafts for all pages. Existing keys are rejected instead of overwritten.
- Home is an ordered list with move-up/down controls. No misleading column/span
  inputs are shown there. Other pages retain grid columns, gap and placement.
- Page switches keep per-page drafts. Save merges every page draft, not just the
  visible page, and normalizes Home before writing.
- Save consumes the sanitized server response, updates runtime theme metadata and
  clears dirty state only on success. Network/validation failures preserve edits.
- Theme switches confirm discarding any layout **or metadata/token** changes.
  Sidebar/ordinary link navigation and browser unload are guarded as well.
- Announcement content/visibility and custom CSS belong to Appearance. Studio
  edits reusable style values, not those store-only settings. Colour labels are
  shared with Appearance through `lib/designTokens.ts`.

The **Apply styling in Appearance** link is enabled only for a saved definition.
It stages a selection at `/admin/appearance?tab=theme&theme=<key>`; the merchant
still clicks **Save appearance**. The preview gallery uses the same flow instead
of a second, inconsistent activation implementation.

## 4. Home replacement and reset

`ReplaceHomepageButton` is shared by Appearance, HomeBuilder and Studio.
Its label is always **Replace homepage from theme**. It:

1. Requires relevant edits to be saved/discarded and explains disabled states.
2. Confirms deletion of all current homepage blocks; styling remains unchanged.
3. Sends one guarded request to `POST /api/home-sections/apply-theme`.
4. Shows API errors without clearing the editor's state; accepts persisted rows
   only after success.

The endpoint accepts `{ themeKey?: string }`. If omitted, it resolves the saved
active theme. It rejects unknown themes, absent/empty home templates and invalid
blocks. There is no automatic default-layout fallback. The compatibility response
field `meta.usedFallback` is always `false`.

`home.applyTheme.ts` converts the saved template to seeds, validates headings,
section count (100 max) and sanitized config size (64KB each), then performs
`deleteMany`, every insert and the final read on **the same transaction client**.
Configuration is scrubbed before deletion. An insert failure propagates out of the
transaction. `POST /api/home-sections/reset` uses the same replacement helper with
explicit platform defaults.

Applying Home is a one-time copy. Later Studio edits do not synchronize into live
rows. There are no migrations and no automatic rewrites of merchant home content.

## 5. Rendering and previews

### Live homepage

`HomeView` → `pickStorefrontHomeSections` → `HomeSectionStack` reads DB rows.
Visibility is controlled solely by `HomeSection.isVisible`. Eight legacy theme
home visibility flags remain API-compatible but are omitted from Appearance and
its save payload. Announcement visibility remains an independent store setting.

Studio Home uses `layoutToHomeSections` → `HomeSectionStack` inside the selected
`PreviewThemeProvider`, so its section order and rendering agree with replacement.
Client/server alias mapping is contract-tested, including logo and gallery images.

### Other pages

`useActiveLayout` / `getServerPageLayout` resolve saved runtime theme layouts.
`LayoutRenderer` retains the grid renderer and page-specific data context.
Where `studioLayoutReplacesChrome` is used, replacing built-in listing/product/CMS
chrome requires a matching native block (`productList`, `productDetail`, etc.).
A marketing-only grid must not silently remove filters or the native page body.

### Three distinct previews

- **Appearance style preview:** current style draft with sample content.
- **Studio template preview:** selected theme and current layout drafts, with
  desktop/tablet/phone frame sizes and sample content.
- **Saved storefront preview:** persisted active store state, not Studio drafts.
  It uses `?studioPreview=<revision>` even for Home, never `?homePreview=`.

Only HomeBuilder's iframe uses `?homePreview=` and reads its temporary session
snapshot. Empty arrays are valid drafts; unmount clears that snapshot.

## 6. APIs

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/themes` | Public runtime catalog of validated theme definitions |
| GET | `/api/theme` | Live appearance settings and active theme configuration |
| PUT / POST | `/api/theme`, `/api/theme/reset` | Save/reset live appearance only |
| GET | `/api/theme-studio/themes` | Admin catalog |
| GET / PUT / DELETE | `/api/theme-studio/themes/:key` | Read/save/remove a definition |
| POST | `/api/theme-studio/install` | Install a data-only theme zip |
| POST | `/api/home-sections/apply-theme` | Explicitly replace Home from a saved template |
| POST | `/api/home-sections/reset` | Explicitly replace Home with platform defaults |

See [THEME_DEVELOPMENT.md](THEME_DEVELOPMENT.md) for packaging, runtime catalog,
bundled-theme markers and data-only installation security.

## 7. Tests and extension points

```bash
npm run test:web
npm run test:components --workspace apps/web
npm run test:api:unit
npm run test:api:integration
npm run build:web
npm run build:api
```

Regression coverage includes:

- Appearance selection versus active state, save payload boundaries, old tab
  links, failed loads/saves and dirty homepage navigation.
- Home draft preservation during visibility/reorder writes; live rows versus
  temporary preview snapshots; legacy visibility flags cannot hide a live block.
- Studio ordered Home versus other-page grids, draft merging/duplication,
  metadata-only dirty state and save failure recovery.
- Shared replacement confirmation, duplicate-click suppression and error handling.
- API auth, missing/invalid templates, validation-before-delete, transaction
  delegate usage and failure propagation, and preview/persistence mapping parity.

API integration tests use the repository's **in-memory Prisma mock**, not a SQL
database. They do not prove database isolation/rollback; run the seeded real-stack
E2E suite in an environment with native Prisma engines and Chromium as well.

To add a block, update its registry/type, renderer/config UI, page palette and both
Home conversion maps if it is Home-compatible. Add a mapping parity test and a
render test. Do not introduce a second homepage visibility or activation path.

## 8. Deliberate limits

- Installed themes are data-only. Custom React `sections/` remain build-time;
  copying section references does not execute uploaded code.
- No combined publish transaction for styling, homepage rows and disk layouts.
  They are explicit operations with separate scopes.
- Browser-local draft/history data is not a durable server backup. Native unload
  and ordinary link navigation are protected; arbitrary programmatic navigation,
  SPA browser-history changes or a browser crash can still lose drafts.
- No marketplace or paid-theme licensing enforcement.
