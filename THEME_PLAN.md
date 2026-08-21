# Theme Improvement & UI Test Plan

Status: implemented (browser suite pending CI run) · Scope: `apps/web` (storefront) + `scripts/` (tests)

---

## 1. Audit — what exists today

**The theming engine is good; the adoption is not.**

- `lib/theme.tsx` — `ThemeProvider` loads `themeSettings` from the API
  (`GET /theme`), converts them to CSS custom properties on `:root`
  (`--brand`, `--body-bg`, `--card-bg`, `--muted`, `--border`, …) and injects
  them as a real stylesheet. Six presets ship in Admin → Appearance
  (Classic, Ocean, Forest, Sunset, Royal, Midnight — the last is a full dark
  theme).
- `app/globals.css` — token fallbacks, keyframes, and an
  `[data-admin-shell]` block that pins the admin dashboard to a fixed neutral
  palette (so a dark storefront theme cannot wash out the dashboard).
- `components/*` — **~2,400 hardcoded hex colours** that bypass the whole
  system. Top offenders: `#666` (381×), `#e5e5e5` (322×), `#fff` (180×),
  `#000` (152×), `#22c55e` (73×), `#ef4444` (60×), `#f59e0b` (49×).

**Consequence (reproducible with the Midnight preset):** light-grey borders
on dark drawers, hardcoded white backgrounds behind menus, grey-on-grey
text, black focus rings on black buttons, success/error buttons that ignore
the palette entirely. Themes work on the header and body, then visibly
break inside cards, menus, badges and status UI.

**No UI tests exist for theming.** The repo's Playwright suites
(`scripts/verify-*.py`) cover pages/commerce/admin; none assert that a
selected theme actually reaches the rendered UI.

## 2. Goals

1. Every colour a shopper sees comes from a theme token (or a deliberate,
   theme-independent status colour) — no ambient hardcoded greys.
2. All six presets render correctly, including the dark preset, with no
   invisible text/borders anywhere.
3. Add the missing polish layer: hover/active feedback, visible focus rings
   that follow the accent colour, consistent radii/shadows, smooth
   transitions (respecting `prefers-reduced-motion`, already global).
4. Lock it in with tests: browser-level theme tests (CI, Playwright — repo
   convention) plus a no-browser static token/ratchet test that runs
   anywhere (and in this sandbox).

## 3. Non-goals

- No redesign of layout/information architecture; this is a tokenisation +
  polish pass, not a reskin.
- No new dependencies (no Tailwind, no component library).
- Admin-editor internals (`HomeBuilder`, `ImageUpload`, `RichTextEditor`,
  `SeoPanel`) keep their fixed palette — they render inside
  `[data-admin-shell]`, which deliberately opts out of the storefront theme.
  They are excluded from the sweep and from the ratchet.
- Status colours (success/danger/warning) stay constant across presets by
  design — they carry meaning; they become tokens so they are addressable
  and admin-theme-safe, not per-preset.

## 4. Token spec (new variables)

| Token | Definition | Notes |
|---|---|---|
| `--brand-hover` | `color-mix(in srgb, var(--brand), #000 12%)` | Derived; buttons/links darken on hover. For light brands this is still safe (12% toward black). |
| `--brand-active` | `color-mix(in srgb, var(--brand), #000 20%)` | Pressed state. |
| `--surface-2` | `color-mix(in srgb, var(--body-text) 4%, var(--body-bg))` | Subtle tinted background that works on light AND dark themes (replaces `#f5f5f5`-style literals). |
| `--success` | `#16a34a` | Fixed meaning. |
| `--danger` | `#dc2626` | Fixed meaning (aligns with default `--sale`). |
| `--warning` | `#d97706` | Fixed meaning (darker amber for text-on-light contrast; buttons keep white text). |
| `--link` | `var(--accent)` | One knob for inline links. |
| `--focus-ring` | `color-mix(in srgb, var(--accent) 70%, transparent)` | Focus-visible outline; replaces the hardcoded black ring that vanishes on dark themes. |
| `--transition` | `0.18s ease` | Single timing token for hover/focus transitions. |

Emission: `themeToCssVars()` gains the derived tokens; the `[data-admin-shell]`
block in `globals.css` re-declares them with fixed values so the dashboard
opt-out keeps working. `color-mix` is supported in every current browser
(2023+); where unsupported, properties using these tokens fall back to the
literal fallbacks already present in `var(...)` call sites.

Also refreshed in `DEFAULT_THEME` (subtle modernisation only):
`mutedText #666 → #6b7280`, `borderColor #e5e5e5 → #e5e7eb`,
`footerBg #fafafa → #f9fafb`.

## 5. globals.css additions

- Themed `:focus-visible` ring (`--focus-ring`) — global, replaces the
  black outline.
- Themed scrollbars (`--border`, `--muted`).
- `a:hover { color: var(--link) }` with `transition: color var(--transition)`.
- A small component layer for reuse and for the tests to target:
  `.btn`, `.btn-primary`, `.btn-outline`, `.btn-danger`, `.card`, `.input`,
  `.badge`, `.section-title` — each built ONLY from tokens.
- `@media (prefers-reduced-motion)` already global — component transitions
  must use `var(--transition)` so they are covered by it.

## 6. Colour sweep (storefront files)

Mapping applied consistently:

| Literal | Becomes |
|---|---|
| `#666`, `#777`, `#888`, `#999`, `#8a8a8a`, `#9a9a9a` (secondary text) | `var(--muted)` |
| `#e5e5e5`, `#e8e8e8`, `#d4d4d4`, `#f0f0f0`, `#ccc`, `#ddd` (borders/dividers) | `var(--border)` |
| `#f5f5f5`, `#f9f9f9`, `#fafafa`, `#f8f8f8` (subtle fills) | `var(--surface-2)` |
| `#fff`/`#ffffff` (panels, menus, popovers) | `var(--card-bg)` |
| `#000`/`#111`/`#333` (text) | `var(--body-text)` |
| `#000`/`#111` (primary buttons/badges) | `var(--brand)` + `var(--brand-text)` |
| `#ef4444`, `#dc2626` (destructive) | `var(--danger)` |
| `#22c55e`, `#16a34a` (success) | `var(--success)` |
| `#f59e0b` (warning/stars) | `var(--warning)` |
| `#3b82f6` (info links) | `var(--link)` |

Files in scope (storefront-visible): `AppShell.tsx` (header, mobile menu,
footer, cart badge), `ProductCard.tsx`, `HomeSections.tsx`, `SearchBar.tsx`,
`AnnouncementBar.tsx`, `PostCard.tsx`, `BannerStrip.tsx`,
`HeroGallery.tsx`, `CouponInput.tsx`, `ReviewSection.tsx`,
`ProductCarousel.tsx`, `Toast.tsx` (status toasts → status tokens).

Judgement calls stay judgement calls: text on a coloured success/danger
button remains literal white; emoji-decorated labels keep their literals
where the colour is decorative, not themed chrome.

## 7. Test plan

### 7.1 `scripts/verify-theme.py` (browser, Playwright — CI job)

For **each of the six presets** (applied via `PUT /api/theme`, original
theme saved and restored in `finally`):

1. Header background and body background/text match the preset's computed
   values (Playwright `evaluate` → `getComputedStyle`).
2. A primary button's background equals the preset brand; its hover colour
   changes (`--brand-hover` ≠ `--brand`).
3. Focus ring: tab to the search input → `outline-color` equals
   `--focus-ring` (not black).
4. Subtle surfaces (`--surface-2`) differ from `--body-bg` and from
   `--card-bg` (the tint is visible).
5. **Dark-theme guard (Midnight):** footer text colour ≠ footer background
   (contrast exists); no storefront panel uses a light background while its
   text is light (sampled on footer, mobile drawer, product card).
6. Admin isolation: with Midnight active, `/admin` still renders the fixed
   light palette (`[data-admin-shell]` variables unchanged).
7. Status tokens: success/danger/warning badges/buttons resolve to their
   fixed token values regardless of preset.
8. Announcement bar on/off + colours honoured when enabled.
9. Mobile drawer opens with `--card-bg` background (viewport 390×844).
10. `prefers-reduced-motion: reduce` emulation → transitions collapse to
    ~0 (already global; assert it stays that way).

### 7.2 `scripts/verify-theme-tokens.js` (Node, no browser — runs here & CI)

1. **Token completeness** — every `var(--x)` referenced anywhere in
   `apps/web` is emitted by `themeToCssVars` or defined in
   `globals.css` (admin block included), or is always used with a literal
   fallback (listed, not failed).
2. **Ratchet** — per-file budget of remaining hardcoded ambient colours
   (`#666`, `#e5e5e5`, `#f5f5f5`, `#999`, `#fff`, `#000`, …) for the swept
   storefront files, set to the post-sweep counts. Any new hardcoded
   ambient colour in those files fails CI until tokenised (and the budget
   may only go down).
3. **globals.css sanity** — balanced braces; component classes present;
   admin shell declares every token in §4.

Exit code 0/1 so CI gates on it.

### 7.3 What runs where

- Browser suite: the existing CI UI job (same runner as
  `verify-pages.py`) — Playwright cannot download browsers in this
  sandbox, so it is syntax-checked here and executed in CI.
- Token suite: runs here and in CI (`node scripts/verify-theme-tokens.js`).

## 8. Verification checklist for this change

- [x] `next build` passes (type-check included)
- [x] `node scripts/verify-theme-tokens.js` green (9/9 checks)
- [x] `python3 -m py_compile scripts/verify-theme.py`
- [x] Storefront serves `:root{--brand-hover:…--surface-2:…}` in the
      ThemeProvider style tag; admin shell re-declares the new tokens
- [x] Midnight preset via API → storefront renders 200 with dark tokens;
      restored to Classic afterwards

Sweep result: 338 ambient hardcoded colours → 114 (deliberate remainder:
white-on-status text, photo scrims, rgba overlays); budgets frozen in
`scripts/verify-theme-tokens.js`.

## 9. Risks & compatibility

- Old cached themes in `localStorage` predate nothing — derived tokens are
  computed at render from whatever theme loads, so existing users get the
  new tokens with zero migration.
- Presets unchanged structurally; only the default neutrals shift by one
  Tailwind-ish step (#666→#6b7280 etc.) — visually near-identical.
- `color-mix` fallback behaviour documented in §4.
- The ratchet budgets protect the sweep; admin-side files are excluded
  with rationale in §3.
