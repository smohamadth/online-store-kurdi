# Theme development — build, package, install, update, remove

This is the developer guide for the store builder's theme system. It
documents the **theme package format**, the **developer workflow**
(create → validate → pack → hand off), and the **admin lifecycle**
(install / edit / remove) that runs on top of it.

> **The one-paragraph model.** A theme is a directory with a `theme.json`
> config (design tokens + optional per-page layouts). Themes that ship with
> the platform may also contain `sections/*.tsx` React components — that is a
> **build-time** capability. Themes an admin installs at runtime are
> **data-only**: tokens + layouts, rendered with the platform's built-in
> section components and the Theme Studio block renderers. Everything below
> explains both tiers and when each applies.

---

## 1. Theme package anatomy

A theme package is a directory (or `.zip` of that directory) named after its
key:

```
themes/<key>/
├── theme.json        # REQUIRED — the theme config (validated on install)
├── preview.png       # recommended — shown in the admin gallery
├── README.md         # recommended — shown to the admin installing it
├── CHANGELOG.md      # optional
├── assets/           # optional — images/fonts the theme references
└── sections/         # OPTIONAL + BUILD-TIME ONLY — React components (see §5)
```

### `theme.json` (the contract)

```jsonc
{
  "key": "solar",                 // ^[a-z0-9][a-z0-9-_]*$, max 40 chars, unique
  "name": "Solar",
  "description": "Warm, high-contrast storefront for fashion stores.",
  "version": "1.2.0",             // semver — used for update checks
  "author": "Kurdi Studio",
  "preview": "/api/themes/solar/preview.png",  // shown in the admin gallery
  "features": { "rtl": true, "darkMode": false, "paid": false },
  "tokens": {                      // design knobs the storefront applies
    "primaryColor": "#ea580c",
    "bodyBg": "#fffaf5",
    "fontFamily": "vazirmatn",
    "radius": 12
    // ...any subset of the full token list; the platform fills the rest
  },
  "layouts": {                     // OPTIONAL — Theme Studio per-page grids
    "home": { "columns": 12, "gap": 24, "blocks": [ /* LayoutBlock[] */ ] }
    // keys: home | products | category | product | blog | blogPost | page
  },
  "sections": {                    // BUILD-TIME ONLY — see §5
    "hero": "@/themes/solar/sections/Hero"
  }
}
```

The schema is enforced by `apps/web/lib/themeConfigSchema.ts` (web build
gate) and mirrored by the API's `validateConfig` (`apps/api/src/modules/
themeStudio/themeStudio.service.ts`, install gate) and by
`scripts/theme-pack.mjs` (pack gate). All three must stay in sync; the
integration tests pin the API's copy.

### Token reference

Tokens are flat `string | number | boolean` values. The canonical list
lives in `apps/web/lib/theme.tsx` (`Theme` interface + `tokensToTheme`
defaults). The most important ones:

| Token | Type | Default | Meaning |
|---|---|---|---|
| `primaryColor` / `primaryTextColor` | hex | `#111111` / `#ffffff` | brand colour, text on it |
| `accentColor` | hex | `#2563eb` | links, focus rings |
| `bodyBg` / `cardBg` / `bodyText` / `mutedText` / `borderColor` | hex | whites | page surfaces |
| `headerBg` / `headerText` / `footerBg` / `footerText` | hex | whites | chrome |
| `priceColor` / `saleColor` | hex | `#111111` / `#dc2626` | price + sale accents |
| `fontFamily` | string | `vazirmatn` | one of the bundled stacks (`system`, `vazirmatn`, `tajawal`, `cairo`, `noto-kufi`, `readex`, `inter`, `georgia`, `mono`, `rounded`, `tahoma`) |
| `baseFontSize` | number | 16 | root font size in px |
| `headingWeight` | number | 800 | heading font weight |
| `radius` / `buttonRadius` | number | 8 | corner radii in px |
| `containerWidth` | number | 1200 | max content width in px |
| `cardShadow` | `none\|soft\|strong` | soft | card elevation |
| `productsPerRow` | number | 4 | product grid density |
| `showTrustBar`, `showTestimonials`, `showStats`, `showNewsletter`, `showDealCountdown`, `showCategories`, `showFeatured`, `showNewArrivals` | boolean | true | home section toggles |
| `announcementBg` / `announcementText2` | hex | `#111111` / `#ffffff` | announcement bar |

Anything not listed is passed through to the runtime theme object, so a
theme can carry extra keys for its own sections.

### `layouts` (optional)

Per-page grid layouts, authored visually in **Theme Studio** or by hand
against `apps/web/lib/layouts/types.ts` (`PageLayout` / `LayoutBlock`).
The seven page keys are `home`, `products`, `category`, `product`, `blog`,
`blogPost`, `page`. A page with no layout renders the platform's built-in
content — layouts are an override, never a requirement. The 33 block types
(hero, featured, cta, video, faq, productDetail, …) are listed in
`docs/THEME_STUDIO.md` §2.

### RTL — mandatory for this platform

The storefront ships Kurdish, Arabic and Persian first. Your theme **must
not use physical CSS properties** (`margin-left`, `left:`, `padding-right`,
`transform: translateX`, …). Use logical properties (`margin-inline-start`,
`inset-inline-start`, `translate` on the inline axis). A build-time test
(`apps/web/lib/theme-rtl.test.tsx`) scans every bundled theme section and
fails on physical properties — run `npm run test:web` before handing a theme
off.

---

## 2. The two tiers: bundled vs installed

| | **Bundled** (in the repo) | **Installed** (admin upload) |
|---|---|---|
| Where it lives | `apps/web/themes/<key>/` (committed) | same dir, written by the API at runtime |
| `theme.json` tokens | static import (build) **+** disk copy wins at runtime | disk only |
| `layouts` | same | same |
| `sections/*.tsx` | **compiled in** — full custom React sections | **not executed** — platform built-in sections render |
| Takes effect | immediately (tokens/layouts via API) — no rebuild needed | immediately |
| Removable by admin | no (`.bundled` marker + `default` is always protected) | yes (guarded: never while it is the active theme — the API switches the store to `default` first) |
| Add one | `npm run theme:create -- <key>` + registry wiring (see §4) | admin uploads the `.zip` |

**Why code sections are build-time only.** The storefront is compiled by
Next.js; executing React code that arrived as uploaded bytes at runtime
would be a remote-code-execution hole and would not survive the bundler.
So a runtime-installed theme is **data**: tokens, layouts, assets. When a
theme needs custom components, it ships bundled (platform theme) or the
developer keeps it installable and composes the 33 built-in blocks — most
storefronts need nothing more.

> A `.zip` may still *contain* a `sections/` directory (e.g. a theme you
> also plan to bundle). The installer stores it inertly on disk; it is
> ignored until the theme is added to the platform build.

---

## 3. Developer workflow

### 3.1 Create

```bash
# Platform theme (adds to the repo, wired into the registry + tests):
npm run theme:create -- solar --name "Solar"

# Any theme dir works as a package; for a pure installable theme you can
# author the directory by hand following §1.
```

`scripts/scaffold-theme.mjs` creates `apps/web/themes/<key>/` with a valid
`theme.json`, template sections, the `.bundled` marker (platform themes),
and updates every touch point the test suite pins (registry, section map,
RTL matrix, picker count). It refuses to overwrite an existing key and
reserves `default`.

### 3.2 Develop

- Edit `theme.json` tokens; preview instantly at
  `http://localhost:3000/preview/<key>`.
- Compose per-page layouts visually in **Admin → Theme Studio**, or hand
  author `layouts` in `theme.json`.
- Add custom sections only for bundled themes (`sections/<Name>.tsx`,
  contract in `apps/web/lib/themeSections.tsx` — `SectionProps`), then add
  the static import to the section map.
- Keep it RTL-safe (§1) and run the suite:
  `cd apps/web && npm test` (registry, RTL, layout renderers).

### 3.3 Validate + pack

```bash
npm run theme:pack -- solar            # validate + zip → dist/themes/solar.zip
npm run theme:pack -- solar --out ./release
```

`scripts/theme-pack.mjs` validates the directory exactly like the API's
install gate (key regex, semver, required fields, feature booleans, token
types, layout shape), then zips `theme.json`, `preview.*`, `README.md`,
`CHANGELOG.md` and `assets/` (excluding `sections/` unless
`--include-sections` is passed — installable packages normally ship
data-only). Idempotent, refuses invalid themes with a readable report.

### 3.4 Hand off / install

Give the merchant the `.zip`. In **Admin → Appearance** they click
**Install theme**, pick the file, and it appears in the gallery
immediately — no rebuild, no deploy (tokens + layouts are served by the
API at runtime). Update = upload a new `.zip` with the same key (the
installer replaces the previous version atomically). Remove = the Remove
button; the API refuses to remove a bundled theme, and if the theme being
removed is the store's active theme it switches the store to `default`
first and says so.

### 3.5 Edit an installed theme

Any theme on disk is editable in **Admin → Theme Studio** (tokens + every
page's layout grid) and in **Admin → Appearance** (per-store overrides on
top of the theme). Saved changes are served at runtime on the next page
load — the old "needs a rebuild" limitation is gone for tokens/layouts.

---

## 4. Adding a *bundled* platform theme

```bash
npm run theme:create -- <key> --name "Name"   # scaffolds + wires everything
# 1. design the tokens/sections/layouts
# 2. add preview.png (public/themes/<key>/preview.png)
# 3. npm run theme:pack -- <key>   (validation gate)
# 4. commit — CI runs the registry/RTL/picker tests
```

The scaffold writes a `.bundled` marker into the theme dir. That marker is
what tells the API "this theme is a platform theme" — it cannot be
overwritten by an install and cannot be removed by an admin. The `default`
theme is protected unconditionally even if the marker is lost.

## 5. Section components (bundled themes only)

A bundled theme can replace platform sections with its own React
component. `theme.json` maps a section name to a component path:

```json
"sections": { "hero": "@/themes/solar/sections/Hero" }
```

The component lives in `apps/web/lib/themeSections.tsx` as a **static
import** — the map `THEME_SECTION_COMPONENTS` turns `"<key>/<section>"`
into the bundled component, so a typo fails the build, not the storefront.
Each section receives `SectionProps` (title, products, categories,
banners, config — see the interface in `themeSections.tsx`). Sections with
no override fall back to the platform's built-in rendering
(`ThemeSectionRenderer`). Installed themes have no entry in the static
map, so they always render the platform's built-in sections — by design.

## 6. Runtime resolution (how the storefront sees a theme)

Single rule: **the disk catalog served by the API is authoritative for
tokens + layouts; the static registry is the build-time fallback and the
code-section source.**

1. `GET /api/theme` (public) returns the store's `ThemeSettings` row —
   per-store overrides, `activeTheme`, and now **`activeThemeConfig`**:
   the parsed on-disk config of the active theme (bundled or installed).
2. The storefront's `ThemeProvider` builds its CSS variables from
   `activeThemeConfig` (or the static registry if absent), then applies
   per-store overrides. Installed themes therefore paint on first load —
   no extra round trip.
3. Page layouts resolve through `lib/themeRuntime.ts` /
   `lib/layouts/serverLayout.ts`, which consult the same config. SSR pages
   (blog, CMS) ship themed layouts in the initial HTML.
4. `GET /api/themes` (public) lists every on-disk theme config — used by
   the admin gallery and the `/preview/<key>` page so installed themes are
   previewable too.

## 7. Admin surface

- **Admin → Appearance**: gallery of bundled + installed themes, Set
  active, Install (`.zip` upload), Remove (installed only), per-store
  token overrides.
- **Admin → Theme Studio**: create / duplicate / edit tokens + per-page
  layouts for any theme on disk; live preview; save writes `theme.json`.

## 8. Production (Docker) notes

- `docker-compose.prod.yml` mounts a `themes_data` volume at
  `/app/apps/web/themes` in the API container and sets `THEMES_DIR` to it,
  so installed themes survive restarts and are visible to the storefront.
- The API image bakes in the bundled themes and its entrypoint seeds them
  into the volume on first boot (skips keys that already exist), so the
  disk catalog always contains the platform themes.
- Keep the volume writable by the API's user. In development
  (bare metal), `THEMES_DIR` defaults to `../web/themes` relative to the
  API process — the repo's own themes dir.

## 9. Security invariants (installed themes)

- A theme zip is **data, never code**: only JSON/text/images are read;
  `sections/` is stored but never imported at runtime.
- Extraction is zip-slip-safe: entry names are normalized and rejected on
  absolute paths, `..` segments, backslashes or drive letters; symlinks
  are rejected; entry count and total size are capped.
- `theme.json` is validated by the same schema as the build gate; a
  malformed zip is rejected before anything is written; an update replaces
  the previous version atomically.
- Bundled keys (`.bundled` marker or `default`) can never be overwritten
  or deleted through the API.
- The active theme can never be deleted out from under the store: the API
  switches the store to `default` first.
