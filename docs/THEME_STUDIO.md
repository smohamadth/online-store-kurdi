# Theme Studio — visual theme & per-page layout builder

The **Theme Studio** is the visual builder that lets a store admin design a
brand-new theme — colours, typography, spacing — **and** take full grid control
over the layout of every storefront page by dragging blocks onto a column grid.
It complements the classic Appearance editor (which edits design tokens and
per-store overrides on an *installed* theme) by letting an admin **create** a
theme from scratch and compose **every page's** blocks visually.

> **TL;DR** — Three tiers: **author** (the Studio UI at `/admin/theme-studio`),
> **persist** (writes a `theme.json` file that carries per-page layouts),
> **render** (one `LayoutRenderer` shared by the editor preview and the
> storefront). A page with **no** layout renders its built-in content unchanged,
> so nothing changes for a stock store until an admin ships a layout.

---

## 1. The data model

The whole system is driven by a small, shared data model in
`apps/web/lib/layouts/types.ts`:

```ts
PageLayout {
  columns: number          // grid-template-columns count (e.g. 12)
  gap:     number          // gutter between cells (px)
  blocks:  LayoutBlock[]   // every block on the page + its grid position
}

LayoutBlock {
  id:       string         // stable id for drag / ordering
  type:     BlockType      // which renderer draws it (see §2)
  colStart: number         // 1-based grid column
  colSpan:  number         // how many columns it occupies
  rowStart: number         // 1-based grid row
  rowSpan:  number         // how many rows it occupies
  config:   Record<string, unknown>   // block-specific payload
}
```

A page key (`PageKey`) names the page a layout applies to:

`home | products | category | product | blog | blogPost | page`

The editor lets an admin pick a page tab and build that page's grid: define the
column count and gap, then place each block with explicit `colStart/colSpan`
and `rowStart/rowSpan`. Pure edit helpers live in `apps/web/lib/layouts/edit.ts`
(`addBlock`, `moveBlock`, `resizeBlock`, `removeBlock`) and are unit-tested to
guarantee a block can never be pushed off the grid.

Per-page **default layouts** (`apps/web/lib/layouts/defaults.ts`) mirror the
built-in storefront as a starting point. A page with **no** layout entry means
"render the platform's built-in layout" — graceful default, nothing forced.

## 2. Block types

`BLOCK_TYPES` (33) fall into three groups:

### Marketing / home blocks
`hero`, `promo`, `bannerStrip`, `trustBar`, `features`, `categories`,
`featured`, `newArrivals`, `trending`, `dealCountdown`, `testimonials`,
`stats`, `gallery`, `richText`, `custom`, `newsletter`.

### Rich pre-built content blocks (ready-made, configurable)
`cta` (banner w/ title/subtitle/button), `video` (auto-embeds YouTube/Vimeo or
plays a direct `.mp4`), `image` (src/alt/caption), `textImage` (split copy +
image, image side selectable), `divider`, `faq` (Q&A items), `steps` (numbered
steps), `logoStrip` (brand logos), `pricing` (tiers with features + a
highlighted plan), `quote` (single testimonial), `iconsGrid` (icon tiles).

The pure helpers that back these live in `apps/web/lib/layouts/blockUtils.ts`
and are unit-tested:

- `toEmbedUrl(url)` — turns a normal YouTube / Vimeo link into a safe `<iframe>`
  `src` (also rejects junk).
- `itemsOf(config)` — reads the `items` array for list-based blocks.
- `LIST_BLOCK_TYPES` + `CONFIG_FIELDS` — the shared source of truth for which
  blocks are list-based and which config fields the editor exposes.

### Page-native blocks (a page's real content)
`productDetail`, `productList`, `categoryGrid`, `blogList`, `blogPostBody`,
`pageContent`. These let a theme author place the **actual** product grid, a
product detail, a blog list, etc. inside a layout grid alongside the marketing
and rich blocks, reading real data from the page's data bag.

## 3. The three tiers

### 3.1 Author — the Studio UI (`/admin/theme-studio`)

A client component (`apps/web/app/admin/theme-studio/page.tsx`) with:

- A **theme list** (read from the API) and **create / duplicate / delete**.
- Per-**page tabs** (all seven `PageKey`s). Edits accumulate in per-page drafts,
  so switching tabs never loses unsaved work; **Save** persists every page.
- A draggable **block palette** (native HTML5 drag-and-drop — no extra library).
- A **drop-zone canvas** that renders the live layout via the same
  `LayoutRenderer` the storefront uses.
- Per-block **grid controls** (column/row start + span), **reorder / hide**,
  and **click-to-edit** inline config (text inputs, selects, numbers, and a
  JSON textarea for list-based blocks).
- A **design-token editor** (colours, font, size, radius) and a live preview
  pane themed with those tokens.

### 3.2 Persist — the file API (`/api/theme-studio`)

`apps/api/src/modules/themeStudio/` (mounted in `app.ts`) provides
file-based CRUD over `apps/web/themes/<key>/`:

| Endpoint | Role | Behaviour |
|---|---|---|
| `GET    /themes` | admin / manager | list installed theme keys |
| `GET    /themes/:key` | admin / manager | read one theme config |
| `PUT    /themes/:key` | admin / manager | create / overwrite a theme |
| `DELETE /themes/:key` | admin / manager | delete an admin theme |

- Each theme is a directory containing a single `theme.json`.
- The config is **validated against the same contract the web build-time
  registry enforces** (key regex, semver version, required name/description/
  author/preview, boolean `rtl/darkMode/paid` features, object tokens).
  Unknown fields are stripped; a malformed theme never reaches disk.
- The web `themeConfigSchema` (`apps/web/lib/themeConfigSchema.ts`) accepts an
  optional `layouts` map, so a Studio-saved theme passes the build-time gate.

### 3.3 Render — the storefront side

`apps/web/lib/layouts/render.tsx` exposes `LayoutRenderer`, the **single**
component that draws a `PageLayout` as a CSS grid (blocks positioned with
explicit `gridColumn`/`gridRow`; unknown types skipped safely). It is used both
by the editor preview and by the storefront, so what you design is what ships.

Pages opt in through one of two seams:

- **Client pages** (`products`, `category`, product detail, and the home page):
  `useActiveLayout(page)` (`lib/layouts/useActiveLayout.ts`) resolves
  `getTheme(theme.activeTheme).layouts?.[page]`. The page renders
  `LayoutRenderer` with its live data when a layout exists, else its built-in
  content. `components/PageLayoutView.tsx` wraps this for convenience.
- **Server-rendered SEO pages** (`blog`, blog post): `getServerPageLayout(page)`
  (`lib/layouts/serverLayout.ts`) reads the active theme from the public
  `/api/theme` endpoint and passes the resolved layout to the client
  `StaticLayoutRenderer`, so the themed layout ships in the **initial HTML**.
- The **home page** reuses its existing rich section renderers: layout blocks
  are bridged to `HomeSection` rows via `lib/layouts/homeMapping.ts`.

## 4. Deployment note (file-based model)

Admin-created themes are written as files under `apps/web/themes/<key>/`. The
web registry (`lib/themeRegistry.ts`) reads themes at **build time**, so a new
or edited admin theme takes effect on the **next web build/deploy**. This is the
deliberate trade-off of the file-based storage model the admin chose — themes
are first-class code artifacts, reviewed and versioned with the platform.

The API writes into the web themes directory via the `THEMES_DIR` env var
(default `../web/themes`, relative to the API cwd; override in tests to a temp
dir so tests never touch real themes).

## 5. Extending the palette (developer guide)

Adding a new block type touches the same places the tests check, so coverage
forces completeness:

1. `lib/layouts/types.ts` — add the `BlockType` union member **and** `BLOCK_TYPES`.
2. `lib/layouts/render.tsx` — add a `BLOCK_RENDERERS[type]` entry (and any pure
   helper in `blockUtils.ts`).
3. `app/admin/theme-studio/page.tsx` — add a `BLOCK_LABELS` entry; add config
   fields to `CONFIG_FIELDS` (and `LIST_BLOCK_TYPES` if it's list-based).
4. Tests — `blockUtils.test.ts` (pure helpers + bookkeeping) and
   `render.test.tsx` (the coverage test fails if a block type has no renderer).

The "every registered block type renders" test in `render.test.tsx` is the
guard: add a type without a renderer and the suite goes red.

## 6. Testing

- `lib/layouts/edit.test.ts` — grid edit invariants (add/reorder/resize clamp/
  remove), including the off-grid guard.
- `lib/layouts/blockUtils.test.ts` — embed URL parsing, `itemsOf`, and
  model ↔ editor ↔ renderer bookkeeping.
- `lib/layouts/homeMapping.test.ts` — layout block → `HomeSection` bridge.
- `lib/layouts/render.test.tsx` — component tests: every block type renders
  without throwing, plus explicit assertions per rich/marketing/page-native
  block and placeholder states.
- `lib/layouts/useActiveLayout.test.tsx` — the client resolution hook
  (found / absent / empty / unknown theme).
- `apps/web/app/admin/theme-studio/page.test.tsx` — the editor UI: drag-and-drop
  add, reorder/remove, per-page draft persistence (save PUT round-trips the
  edited `layouts`), and the responsive stacking of the 3-column canvas
  (theme list | canvas | palette) below 900px.
- `apps/api/tests/integration/themeStudio.test.ts` — the file API: auth guards,
  key validation, semver/feature validation, unknown-field stripping, list/read/
  write/delete against a temp themes dir.

## 7. Honest limitations

- **File-based themes need a rebuild** to appear on the live storefront (see §4).
- **Home page rich blocks**: the home page renders a themed layout through its
  home-specific section renderers, so a rich block (`cta`, `faq`, …) placed on
  the *home* page falls back to a custom/title section. Rich blocks render fully
  on products, category, product detail, blog, blog post, and custom pages,
  which use `LayoutRenderer`.
- **Full-layout override replaces rich page chrome**: when an admin defines a
  layout for a page such as `/products`, that layout (not the built-in filter
  sidebar / pagination) is what renders — the admin's explicit composition wins.
- The API is a thin, validated CRUD layer; it stores `theme.json` (including
  `layouts`) but the per-block **config** values are authored in the Studio and
  trusted as authored (rich HTML blocks are sanitised on the home path).
