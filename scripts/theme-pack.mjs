#!/usr/bin/env node
/**
 * theme-pack — validate a theme directory and package it as an installable
 * .zip for the admin "Install theme" flow.
 *
 * Usage:
 *   node scripts/theme-pack.mjs <key> [--out <dir>] [--include-sections]
 *
 * Examples:
 *   node scripts/theme-pack.mjs solar                  # → dist/themes/solar.zip
 *   node scripts/theme-pack.mjs solar --out ./release  # → ./release/solar.zip
 *
 * What it does:
 *   1. VALIDATE — the theme dir must satisfy exactly what the API's install
 *      gate enforces (key regex, semver, required fields, feature booleans,
 *      token types). A theme that fails here would be rejected by
 *      POST /api/theme-studio/install anyway, so this is the developer-side
 *      check before handing a package off.
 *   2. PACK — zip `theme.json`, `preview.*`, `README.md`, `CHANGELOG.md`
 *      and `assets/`. Code sections (`sections/`) are EXCLUDED by default
 *      because runtime-installed themes are data-only (sections only work
 *      for platform-bundled themes); pass --include-sections if you want a
 *      package that also carries the source for a future bundle.
 *      The `.bundled` marker is never included (it is the platform's flag).
 *
 * Notes:
 * - The validator here is a mirror of the API's validateConfig
 *   (apps/api/src/modules/themeStudio/themeStudio.service.ts) and of the web
 *   build gate (apps/web/lib/themeConfigSchema.ts). If you change the theme
 *   contract, update all three (the integration tests pin the API's copy).
 * - Idempotent: refuses to overwrite an existing zip unless --force.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.length < 1 || args.includes('-h') || args.includes('--help')) {
  console.log('Usage: node scripts/theme-pack.mjs <key> [--out <dir>] [--include-sections] [--force]');
  console.log('Example: node scripts/theme-pack.mjs solar --out ./release');
  process.exit(args.length < 1 ? 1 : 0);
}
const key = args[0];
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : 'dist/themes';
const includeSections = args.includes('--include-sections');
const force = args.includes('--force');

// ---------------------------------------------------------------------------
// validator — mirrors the API install gate (see header note)
// ---------------------------------------------------------------------------
const KEY_RE = /^[a-z0-9][a-z0-9-_]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/;

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('Theme config must be an object');
  if (typeof cfg.key !== 'string' || !KEY_RE.test(cfg.key)) {
    throw new Error('Theme key may only contain a-z, 0-9, "-" and "_", and must start with a letter or digit');
  }
  if (typeof cfg.name !== 'string' || !cfg.name.trim()) throw new Error('Theme name is required');
  if (typeof cfg.description !== 'string' || !cfg.description.trim()) throw new Error('Theme description is required');
  if (typeof cfg.author !== 'string' || !cfg.author.trim()) throw new Error('Theme author is required');
  if (typeof cfg.preview !== 'string' || !cfg.preview.trim()) throw new Error('Theme preview is required');
  if (typeof cfg.version !== 'string' || !SEMVER_RE.test(cfg.version)) {
    throw new Error('Theme version must be semver (e.g. 1.0.0)');
  }
  const f = cfg.features;
  if (!f || typeof f !== 'object' || typeof f.rtl !== 'boolean' || typeof f.darkMode !== 'boolean' || typeof f.paid !== 'boolean') {
    throw new Error('Theme features must include boolean rtl, darkMode and paid');
  }
  if (typeof cfg.tokens !== 'object' || cfg.tokens === null) throw new Error('Theme tokens must be an object');
  if (cfg.layouts !== undefined && (typeof cfg.layouts !== 'object' || cfg.layouts === null)) {
    throw new Error('Theme layouts must be an object');
  }
  if (cfg.sections !== undefined && (typeof cfg.sections !== 'object' || cfg.sections === null)) {
    throw new Error('Theme sections must be an object');
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// 1. validate
// ---------------------------------------------------------------------------
const themeDir = path.join(root, 'apps', 'web', 'themes', key);
const themeJsonPath = path.join(themeDir, 'theme.json');
if (!fs.existsSync(themeJsonPath)) {
  console.error(`x no theme at ${themeDir} (theme.json not found)`);
  process.exit(1);
}
let raw;
try {
  raw = JSON.parse(fs.readFileSync(themeJsonPath, 'utf8'));
} catch {
  console.error('x theme.json is not valid JSON');
  process.exit(1);
}
try {
  validateConfig(raw);
} catch (e) {
  console.error(`x invalid theme "${key}": ${e.message}`);
  process.exit(1);
}
if (raw.key !== key) {
  console.error(`x theme.json key "${raw.key}" does not match the directory name "${key}"`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. pack
// ---------------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${key}.zip`);
if (fs.existsSync(outFile) && !force) {
  console.error(`x ${outFile} already exists (use --force to overwrite)`);
  process.exit(1);
}

const zip = archiver('zip', { zlib: { level: 9 } });
const stream = fs.createWriteStream(outFile);
const done = new Promise((resolve, reject) => {
  stream.on('close', resolve);
  zip.on('error', reject);
  zip.on('warning', (w) => console.warn(`  ! ${w.message}`));
});
zip.pipe(stream);

let added = 0;
const addFile = (name) => {
  const p = path.join(themeDir, name);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    zip.file(p, { name });
    added += 1;
  }
};
const addDir = (name) => {
  const p = path.join(themeDir, name);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    zip.directory(p, name);
    added += 1;
  }
};

addFile('theme.json');
for (const p of ['preview.png', 'preview.jpg', 'preview.jpeg', 'preview.webp', 'preview.svg']) addFile(p);
addFile('README.md');
addFile('CHANGELOG.md');
addDir('assets');
if (includeSections) {
  addDir('sections');
  console.log('  (including sections/ — note: runtime-installed themes are data-only; sections only activate when the theme is bundled with the platform)');
}

await zip.finalize();
await done;

const size = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`✓ theme "${key}" v${raw.version} validated and packed → ${outFile} (${size} KB, ${added} item${added === 1 ? '' : 's'})`);
console.log(`  Admin: Appearance → Install a theme → upload this file.`);
