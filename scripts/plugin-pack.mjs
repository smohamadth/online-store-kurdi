#!/usr/bin/env node
/**
 * plugin-pack — validate a plugin directory and package it as an
 * installable .zip for the admin "Install a plugin" flow.
 *
 * Usage:
 *   node scripts/plugin-pack.mjs <dir> [--out <dir>] [--force]
 *
 * Examples:
 *   node scripts/plugin-pack.mjs plugins-dev/slack-alerts     # → dist/plugins/slack-alerts.zip
 *   node scripts/plugin-pack.mjs ./my-plugin --out ./release  # → ./release/my-plugin.zip
 *
 * What it does:
 *   1. VALIDATE — the plugin dir must satisfy exactly what the API's
 *      install gate enforces: a plugin.json with a valid id (lowercase
 *      a-z/0-9/-, ≤40), semver, name/description/author, kind (webhook
 *      for uploads), a hooks subset of the known events, permissions
 *      subset, and a well-formed configSchema. A plugin that fails here
 *      would be rejected by POST /api/plugins/install anyway, so this is
 *      the developer-side check before handing a package off.
 *   2. PACK — zip `plugin.json`, `README.md` and `assets/`. Everything
 *      else is left out; installed plugins are data-only by design.
 *
 * Notes:
 * - The validator here is a mirror of the API's pluginManifestSchema
 *   (apps/api/src/modules/plugins/plugin.schema.ts). If you change the
 *   plugin contract, update both (the integration tests pin the API copy).
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
  console.log('Usage: node scripts/plugin-pack.mjs <dir> [--out <dir>] [--force]');
  console.log('Example: node scripts/plugin-pack.mjs my-plugin');
  process.exit(args.length < 1 ? 1 : 0);
}
const pluginDir = path.resolve(root, args[0]);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(root, outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : 'dist/plugins');
const force = args.includes('--force');

// ---------------------------------------------------------------------------
// validator — mirrors the API install gate (see header note)
// ---------------------------------------------------------------------------
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/;
const KNOWN_HOOKS = ['order.created', 'payment.settled', 'product.created', 'product.updated', 'customer.registered'];

function fail(msg) {
  console.error(`✗ plugin-pack: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(pluginDir, 'plugin.json'))) {
  fail(`"${pluginDir}" has no plugin.json at its root`);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
} catch (e) {
  fail(`plugin.json is not valid JSON: ${e.message}`);
}

if (typeof manifest.id !== 'string' || manifest.id.length < 1 || manifest.id.length > 40 || !ID_RE.test(manifest.id)) {
  fail('plugin.json "id" must be 1–40 chars of lowercase a-z, 0-9 or "-", starting with a letter or digit');
}
if (typeof manifest.name !== 'string' || !manifest.name.trim()) fail('plugin.json "name" is required');
if (typeof manifest.description !== 'string' || !manifest.description.trim()) fail('plugin.json "description" is required');
if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
  fail('plugin.json "version" must be semver (e.g. 1.0.0)');
}
if (typeof manifest.author !== 'string' || !manifest.author.trim()) fail('plugin.json "author" is required');
if (manifest.kind !== 'webhook' && manifest.kind !== 'code') {
  fail('plugin.json "kind" must be "webhook" (uploads) or "code" (platform-bundled)');
}
if (manifest.kind !== 'webhook') {
  fail('Uploaded plugins must be kind "webhook" — code plugins are platform-bundled only');
}
if (!Array.isArray(manifest.hooks) || manifest.hooks.some((h) => !KNOWN_HOOKS.includes(h))) {
  fail(`plugin.json "hooks" must be a subset of: ${KNOWN_HOOKS.join(', ')}`);
}
if (manifest.permissions !== undefined) {
  if (!Array.isArray(manifest.permissions) || manifest.permissions.some((p) => p !== 'webhook')) {
    fail('plugin.json "permissions" must be a subset of: webhook');
  }
}
if (manifest.configSchema !== undefined) {
  if (typeof manifest.configSchema !== 'object' || manifest.configSchema === null || Array.isArray(manifest.configSchema)) {
    fail('plugin.json "configSchema" must be an object');
  }
  for (const [field, spec] of Object.entries(manifest.configSchema)) {
    if (field.length > 60) fail(`configSchema field "${field}" exceeds 60 chars`);
    if (!spec || typeof spec !== 'object') fail(`configSchema field "${field}" must be an object`);
    if (!['string', 'boolean', 'number'].includes(spec.type)) fail(`configSchema field "${field}" must have type string|boolean|number`);
    if (spec.required !== undefined && typeof spec.required !== 'boolean') fail(`configSchema field "${field}" "required" must be boolean`);
    if (spec.secret !== undefined && typeof spec.secret !== 'boolean') fail(`configSchema field "${field}" "secret" must be boolean`);
    if (spec.max !== undefined && (typeof spec.max !== 'number' || spec.max <= 0)) fail(`configSchema field "${field}" "max" must be a positive number`);
    if (spec.default !== undefined && !['string', 'boolean', 'number'].includes(typeof spec.default)) {
      fail(`configSchema field "${field}" "default" must be a string, boolean or number`);
    }
  }
}

// ---------------------------------------------------------------------------
// pack
// ---------------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });
const zipName = `${manifest.id}.zip`;
const zipPath = path.join(outDir, zipName);
if (fs.existsSync(zipPath) && !force) {
  fail(`"${zipPath}" already exists — pass --force to overwrite`);
}

const zip = archiver('zip', { zlib: { level: 9 } });
const out = fs.createWriteStream(zipPath);
zip.pipe(out);
zip.file(path.join(pluginDir, 'plugin.json'), { name: 'plugin.json' });
for (const extra of ['README.md', 'CHANGELOG.md']) {
  const p = path.join(pluginDir, extra);
  if (fs.existsSync(p)) zip.file(p, { name: extra });
}
const assets = path.join(pluginDir, 'assets');
if (fs.existsSync(assets) && fs.statSync(assets).isDirectory()) {
  zip.directory(assets, 'assets');
}
zip.finalize();
out.on('close', () => {
  console.log(`✓ ${manifest.id} v${manifest.version} → ${zipPath} (${fs.statSync(zipPath).size} bytes)`);
});
zip.on('error', (e) => fail(e.message));
