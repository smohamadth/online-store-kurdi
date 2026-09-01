#!/usr/bin/env node
/**
 * Static theming checks — no browser needed, runs anywhere (CI + sandbox).
 *
 *   node scripts/verify-theme-tokens.js
 *
 * Companion to scripts/verify-theme.py (which drives a real browser and
 * asserts computed styles). This one guards the SOURCE:
 *
 *   1. TOKEN COMPLETENESS — every `var(--x)` referenced anywhere in apps/web
 *      is either emitted by themeToCssVars(), declared in globals.css
 *      (the [data-admin-shell] block included), or always used with a
 *      literal fallback (reported, not failed — a fallback means a stale
 *      token can never render as invalid).
 *
 *   2. RATCHET — the storefront component files swept in THEME_PLAN.md §6
 *      may not regain hardcoded AMBIENT colours (greys, off-whites, plain
 *      black/white backgrounds-and-borders). Budgets are frozen at the
 *      post-sweep counts; they may only go DOWN. Status colours and
 *      deliberate literals (white text on a status chip, scrims over
 *      photos) are counted by the same regex — the budget is the guard,
 *      not the regex's opinion.
 *
 *   3. GLOBALS SANITY — globals.css is balanced, ships the token-built
 *      component classes, and the admin shell re-declares every derived
 *      token so the dashboard opt-out keeps holding.
 *
 * Exit code 0 = pass, 1 = fail. CI gates on it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  FAIL  ${msg}`);
};
const ok = (msg) => console.log(`  PASS  ${msg}`);

// --------------------------------------------------------------------------
// 1. Token completeness
// --------------------------------------------------------------------------
console.log('\n1. Token completeness');

const themeSrc = read('apps/web/lib/theme.tsx');

// Every `--token:` declaration inside themeToCssVars() — the runtime set.
const fnBody = themeSrc.slice(
  themeSrc.indexOf('export function themeToCssVars'),
  themeSrc.indexOf('interface Ctx')
);
const emitted = new Set(
  [...fnBody.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((m) => `--${m[1]}`)
);

// Every `--token:` declaration in globals.css — the static/fallback set
// (includes the [data-admin-shell] block).
const globals = read('apps/web/app/globals.css');
const declared = new Set(
  [...globals.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((m) => `--${m[1]}`)
);

// Every var(--x) USED in the app, tracking whether each use has a fallback.
function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walk(p, acc);
    } else if (/\.(tsx?|css)$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}
const webFiles = walk(path.join(ROOT, 'apps/web'), []);
const used = new Map(); // token -> { withFallback: n, bare: n, files: Set }
for (const p of webFiles) {
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/var\((--[a-z0-9-]+)(\s*,[^)]*)?\)/gi)) {
    const token = m[1];
    const hasFallback = Boolean(m[2]);
    const e = used.get(token) || { withFallback: 0, bare: 0, files: new Set() };
    hasFallback ? e.withFallback++ : e.bare++;
    e.files.add(path.relative(ROOT, p));
    used.set(token, e);
  }
}

const known = new Set([...emitted, ...declared]);
let missingBare = 0;
const coveredByFallbackOnly = [];
for (const [token, info] of [...used.entries()].sort()) {
  if (known.has(token)) continue;
  if (info.bare > 0) {
    missingBare += info.bare;
    fail(`${token} used without fallback and never defined (${[...info.files].slice(0, 3).join(', ')})`);
  } else {
    coveredByFallbackOnly.push(token);
  }
}
if (missingBare === 0) {
  ok(`all ${used.size} referenced tokens are defined or always used with a fallback`);
}
if (coveredByFallbackOnly.length) {
  console.log(`        (defined nowhere but always with a fallback — harmless: ${coveredByFallbackOnly.join(', ')})`);
}

// The §4 token set must be emitted at runtime AND pinned for the admin shell.
const REQUIRED_TOKENS = [
  '--brand', '--brand-text', '--accent', '--body-bg', '--card-bg',
  '--body-text', '--muted', '--border', '--header-bg', '--header-text',
  '--footer-bg', '--footer-text', '--price', '--sale', '--font',
  '--font-size', '--heading-weight', '--radius', '--btn-radius',
  '--container', '--shadow', '--shadow-hover',
  '--brand-hover', '--brand-active', '--surface-2', '--success',
  '--danger', '--warning', '--link', '--focus-ring', '--transition',
];
const missingEmit = REQUIRED_TOKENS.filter((t) => !emitted.has(t));
const missingDeclare = REQUIRED_TOKENS.filter((t) => !declared.has(t));
if (missingEmit.length === 0) ok('themeToCssVars emits the full token set (THEME_PLAN.md §4)');
missingEmit.forEach((t) => fail(`themeToCssVars does not emit ${t}`));
if (missingDeclare.length === 0) ok('globals.css (incl. [data-admin-shell]) declares the full token set');
missingDeclare.forEach((t) => fail(`globals.css does not declare ${t}`));

// --------------------------------------------------------------------------
// 2. Ratchet
// --------------------------------------------------------------------------
console.log('\n2. Hardcoded-ambient-colour ratchet (budgets frozen post-sweep)');

// SEE THEME_PLAN.md §6. Budgets = counts immediately after the sweep.
// ProductCard (10→11) and ReviewSection (12→16) were raised once for the
// follow-up feature work after the sweep (digital-product + sold-out/
// low-stock badges, compare toggle, review photos/lightbox). The added
// occurrences are `var(--token, #fallback)` patterns the sweep predates,
// plus two deliberate bare values: white text on the fixed --success badge
// (ProductCard) and the black lightbox backdrop (ReviewSection).
const BUDGETS = {
  'apps/web/components/AppShell.tsx': 25,
  'apps/web/components/ProductCard.tsx': 11,
  'apps/web/components/HomeSections.tsx': 29,
  'apps/web/components/SearchBar.tsx': 8,
  'apps/web/components/AnnouncementBar.tsx': 0,
  'apps/web/components/PostCard.tsx': 7,
  'apps/web/components/BannerStrip.tsx': 3,
  'apps/web/components/HeroGallery.tsx': 9,
  'apps/web/components/CouponInput.tsx': 5,
  'apps/web/components/ReviewSection.tsx': 16,
  'apps/web/components/ProductCarousel.tsx': 4,
  'apps/web/components/Toast.tsx': 2,
};
const AMBIENT = /#(666|667|777|888|999|e5e5e5|e8e8e8|d4d4d4|f0f0f0|f5f5f5|f9f9f9|fafafa|f8f8f8|ccc|ddd|fff|ffffff|000|000000|111|333)\b/gi;

let ratchetOk = true;
for (const [file, budget] of Object.entries(BUDGETS)) {
  const count = (read(file).match(AMBIENT) || []).length;
  if (count > budget) {
    ratchetOk = false;
    fail(`${file}: ${count} ambient colours > budget ${budget} — tokenise the new ones or justify & lower elsewhere`);
  }
}
if (ratchetOk) {
  const total = Object.keys(BUDGETS).reduce((a, f) => a + (read(f).match(AMBIENT) || []).length, 0);
  const budgetTotal = Object.values(BUDGETS).reduce((a, b) => a + b, 0);
  ok(`${total}/${budgetTotal} of the frozen budget used (was 338 before the sweep)`);
}

// --------------------------------------------------------------------------
// 3. globals.css sanity
// --------------------------------------------------------------------------
console.log('\n3. globals.css sanity');

const open = (globals.match(/\{/g) || []).length;
const close = (globals.match(/\}/g) || []).length;
if (open === close) ok(`braces balanced (${open})`);
else fail(`braces unbalanced: ${open} "{" vs ${close} "}"`);

const CLASSES = ['.btn', '.btn-primary', '.btn-outline', '.btn-danger', '.card', '.card-hover', '.input', '.badge', '.badge-sale', '.section-title'];
const missingClasses = CLASSES.filter((c) => !globals.includes(`${c} {`) && !globals.includes(`${c},`) && !globals.includes(`${c}:`));
if (missingClasses.length === 0) ok('token-built component classes present (THEME_PLAN.md §5)');
missingClasses.forEach((c) => fail(`component class ${c} missing from globals.css`));

if (globals.includes('--focus-ring') && /focus-visible[^}]*--focus-ring/.test(globals.replace(/\s+/g, ' '))) {
  ok('global focus ring follows --focus-ring');
} else {
  fail('*:focus-visible does not use --focus-ring');
}

if (/prefers-reduced-motion/.test(globals)) ok('prefers-reduced-motion guard present');
else fail('prefers-reduced-motion guard missing');

// --------------------------------------------------------------------------
console.log(`\n${failures === 0 ? '✅ All static theme checks passed.' : `⚠️  ${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
