# Theme System + Sellable Themes — Status

**Date:** 2026-08-25
**Branch:** `arena/01a022ee-online-store-kurdi`
**Commit:** `d32311a` — feat(theme-system): multi-theme registry + Minimal theme

## What this commit ships

The platform used to ship one theme. This commit makes the theme
swappable: a registry, a config-per-theme directory layout, a
section-override system, and the first paid theme ("Minimal")
as proof the system works end-to-end.

### Architecture

A theme is a directory under `apps/web/themes/<key>/` containing
a `theme.json` config file. The registry reads the configs at
build time and exposes them as a typed list. The home page
renders the active theme's overrides where present or the
platform default otherwise.

```
apps/web/themes/
├── default/
│   ├── theme.json          (the platform default, same tokens as before)
│   └── sections/
│       └── Hero.tsx        (delegates to HeroGallery)
└── minimal/                (first paid theme, the Minimal theme)
    ├── theme.json
    └── sections/
        ├── Hero.tsx        (text-first typographic statement)
        ├── Featured.tsx    (square-aspect grid, no chrome)
        └── Categories.tsx  (vertical list of links)
```

### What "Minimal" is

The first paid theme. A text-first theme for writers, makers, and
craft sellers. Generous whitespace, serif headings, no marketing
chrome. The product is the brand; the storefront gets out of
the way.

Distinct choices vs the default:
- **Serif** (Georgia) instead of system-ui
- **Zero** border-radius on buttons (vs 8px on default)
- **No card shadow** (vs soft on default)
- **3 products per row** (vs 4)
- **No trust bar, testimonials, stats, deal countdown, new arrivals**
- **Categories as a vertical list of links** (vs a tile grid)

Marked as `paid: true` in the registry. The platform now has
the foundation for a real theme marketplace.

### Test counts

| | Before | After |
|---|---:|---:|
| `apps/web` lib | 198 | 198 |
| `apps/web` components | 279 | 303 (+24) |
| **Total** | **477** | **501** |

The 24 new tests pin the registry (every theme ships a complete
config, the fallback resolves correctly, the Minimal theme's
signature choices are enforced) and the section override system
(the right component renders for the right theme, an unknown
section falls through to the platform default).

## What's NOT in this commit

Three things deferred to follow-up turns. Listed in priority order
because the first one is the obvious next step.

### 1. Admin theme picker UI (next turn)

The runtime path works end-to-end — the API accepts `activeTheme`,
the web reads it, the override system resolves it — but the
merchant-facing "pick a theme" dropdown in `Admin → Appearance`
is not built. The existing appearance page is 513 lines and
hosts the colour picker / typography / hero section editor.
The picker is a small addition (a card grid at the top of the
colours tab) but it's a focused UI change and worth its own
commit.

### 2. Theme preview URLs (week 2)

A merchant shopping for themes wants to see what their store
looks like. A standalone preview URL (`/preview/<theme-key>`)
that loads the theme with sample data is the difference
between "I'll buy it" and "I have to imagine it." This is also
where the preview image in `theme.json` gets used.

### 3. Theme marketplace (week 3-4)

The "buy this theme" flow. Three pieces:
- A marketing site (one page) with a gallery of themes, each
  with its preview image and a "buy" button.
- A payment processor (Gumroad or LemonSqueezy, both hosted —
  same "don't build checkout" lesson as the SaaS plan).
- A license-key check on the installed themes directory:
  paid themes need a valid license, free themes don't.

This is the part that turns the engineering into a product.
Without the marketplace, the theme system is a feature for
power users; with it, the platform has a real revenue stream.

## The 8-week product roadmap (recap)

For context, here's where the theme system fits in the larger
self-hosted-platform-with-themes plan from the conversation:

| Phase | Weeks | Status |
|---|---|---|
| 1. Codebase cleanup | 1–2 | Skipped (untracked files were valuable, not dead) |
| 2. Theme system | 1 | **Done** (this commit) |
| 3. Three themes | 3 | Started (Minimal is done; two more to go) |
| 4. Sales site + landing | 1 | Not started |

The realistic path from here:
- **This turn** (done): theme system + Minimal theme. The
  platform is now theme-aware and has a paid theme to sell.
- **Next turn**: admin picker UI + the second paid theme
  (probably "Bold", a dark-mode / large-imagery theme).
- **Week 3**: third paid theme + preview URLs.
- **Week 4**: marketing site + Gumroad integration. First
  sale possible.

## Risks, ranked

1. **The Minimal theme is unstyled-tested.** I built it from
   scratch in this turn and the tests pin the *config*, not
   the visual. A real iPhone / iPad / desktop screenshot pass
   will find issues the tests can't. Until then, the theme
   is "works as intended" but not "looks right everywhere."
2. **Section overrides replace the inline JSX wholesale.**
   When the Minimal theme overrides "featured", the platform's
   ProductCard-based grid goes away. The Minimal theme ships
   its own simpler grid. If a merchant uses the Minimal theme
   and wants the rich product card (ratings, "Add to cart"
   preview buttons, etc.), they're out of luck until the
   override system grows a "wrap" mode.
3. **The registry is hard-coded.** Adding a theme today
   requires editing `themeRegistry.ts` and the API's INSTALLED_THEMES
   whitelist. A future change is to publish the registry as a
   shared package (a JSON file in `packages/themes/` consumed
   by both the API and the web app).
4. **The Minimal theme is free-as-in-beer but paid-as-in-price.**
   Without the marketplace piece, a customer can download the
   theme source and ship it themselves. The license check is
   the missing piece. Build it before the marketing site.

## How to extend

Adding a new theme today:

1. Create `apps/web/themes/<key>/theme.json`. Copy the Minimal
   theme's file as a starting point. Required keys: `key`,
   `name`, `description`, `version`, `author`, `preview`,
   `features`, `tokens`. Optional: `sections` for overrides.
2. Add the theme to the `THEMES` array in
   `apps/web/lib/themeRegistry.ts`:
   ```ts
   import myNewThemeJson from '@/themes/my-new-theme/theme.json';
   export const THEMES = [
     defaultThemeJson,
     minimalThemeJson,
     myNewThemeJson as unknown as ThemeConfig,
   ] as const;
   ```
3. Add the theme key to the API's `INSTALLED_THEMES` whitelist
   in `apps/api/src/modules/theme/theme.routes.ts`.
4. Add overrides in `apps/web/themes/<key>/sections/` for
   each section the theme wants to redesign. The
   `THEME_SECTION_COMPONENTS` map in `themeSections.tsx` needs
   an entry per override.
5. Add a test in `lib/theme.test.tsx` for the new theme's
   distinguishing choices.

The path is mechanical but it touches four files. A future
refactor (publish the registry as a shared package, build a
CLI to scaffold a new theme) would compress this to one
command. Not worth doing until the second or third theme.
