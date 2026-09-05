// ---------------------------------------------------------------------------
// Theme studio service — reads and writes admin-created themes as theme.json
// files on disk (the "files" storage model: a theme is a directory under the
// themes dir containing a theme.json).
//
// The layout shape is defined by the web app (lib/layouts/types.ts + the
// themeConfigSchema). The API is deliberately a thin, validated CRUD layer:
// it stores whatever a valid theme config looks like and refuses to write
// anything that violates the shared schema, so a malformed theme never reaches
// the storefront.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { extractZipToMap, normalizeEntryPaths } from '../../utils/zipPackage';
import { scrubStudioLayouts } from '../../utils/scrubBuilderConfig';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);
const rename = promisify(fs.rename);

// ---------------------------------------------------------------------------
// Theme package limits (an uploaded .zip is untrusted input).
// ---------------------------------------------------------------------------
const MAX_ZIP_BYTES = 10 * 1024 * 1024; // keep in sync with the multer limit in the routes

/** A minimal, self-contained theme-config validator (mirrors the web schema). */
export interface ThemeStudioConfig {
  key: string;
  name: string;
  description: string;
  version: string;
  author: string;
  preview: string;
  features: { rtl: boolean; darkMode: boolean; paid: boolean };
  tokens: Record<string, string | number | boolean>;
  layouts?: Record<string, unknown>;
  /** Logical section keys → platform component paths (copied when duplicating a niche theme). */
  sections?: Record<string, string>;
}

const KEY_RE = /^[a-z0-9][a-z0-9-_]{0,39}$/;
// Full semver (mirrors the web themeConfigSchema) so a theme saved here is
// guaranteed to pass the web build-time registry gate.
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/;

function validateConfig(cfg: unknown, forKey: string): ThemeStudioConfig {
  if (!cfg || typeof cfg !== 'object') throw new Error('Theme config must be an object');
  const c = cfg as Record<string, unknown>;

  if (typeof c.key !== 'string' || c.key !== forKey) {
    throw new Error(`Theme key mismatch: expected "${forKey}", got "${String(c.key)}"`);
  }
  if (!KEY_RE.test(forKey)) {
    throw new Error('Theme key may only contain a-z, 0-9, "-" and "_", and must start with a letter or digit');
  }
  if (typeof c.name !== 'string' || !c.name.trim()) throw new Error('Theme name is required');
  if (typeof c.description !== 'string' || !c.description.trim()) throw new Error('Theme description is required');
  if (typeof c.author !== 'string' || !c.author.trim()) throw new Error('Theme author is required');
  if (typeof c.preview !== 'string' || !c.preview.trim()) throw new Error('Theme preview is required');
  if (typeof c.version !== 'string' || !SEMVER_RE.test(c.version)) {
    throw new Error('Theme version must be semver (e.g. 1.0.0)');
  }

  const f = c.features;
  if (!f || typeof f !== 'object') throw new Error('Theme features are required');
  const feat = f as Record<string, unknown>;
  if (
    typeof feat.rtl !== 'boolean' ||
    typeof feat.darkMode !== 'boolean' ||
    typeof feat.paid !== 'boolean'
  ) {
    throw new Error('Theme features must include boolean rtl, darkMode and paid');
  }

  if (typeof c.tokens !== 'object' || c.tokens === null) throw new Error('Theme tokens must be an object');

  let sections: Record<string, string> | undefined;
  if (c.sections != null) {
    if (typeof c.sections !== 'object' || Array.isArray(c.sections)) {
      throw new Error('Theme sections must be an object of string paths');
    }
    sections = {};
    for (const [k, v] of Object.entries(c.sections as Record<string, unknown>)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(k)) {
        throw new Error(`Invalid section key \"${k}\"`);
      }
      if (typeof v !== 'string' || !v.trim() || v.length > 200) {
        throw new Error(`Section \"${k}\" must be a component path`);
      }
      sections[k] = v.trim();
    }
    if (!Object.keys(sections).length) sections = undefined;
  }

  return {
    key: forKey,
    name: c.name as string,
    description: c.description as string,
    version: c.version as string,
    author: c.author as string,
    preview: c.preview as string,
    features: { rtl: feat.rtl as boolean, darkMode: feat.darkMode as boolean, paid: feat.paid as boolean },
    tokens: c.tokens as Record<string, string | number | boolean>,
    ...(typeof c.layouts === 'object' && c.layouts !== null ? { layouts: c.layouts as Record<string, unknown> } : {}),
    ...(sections ? { sections } : {}),
  };
}

function themesDir(): string {
  // env.THEMES_DIR is relative to the API cwd (apps/api).
  return path.resolve(process.cwd(), process.env.THEMES_DIR || '../web/themes');
}

function themePath(key: string): string {
  return path.join(themesDir(), key, 'theme.json');
}

/** List the keys of every theme on disk (bundled + admin-created). */
export async function listThemeKeys(): Promise<string[]> {
  const dir = themesDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const keys: string[] = [];
  for (const e of entries) {
    // Only directories with a theme.json count as themes.
    if (fs.existsSync(path.join(dir, e, 'theme.json'))) keys.push(e);
  }
  return keys.sort();
}

/** Read one theme config. Returns null if it does not exist / is malformed. */
export async function getThemeConfig(key: string): Promise<ThemeStudioConfig | null> {
  if (!KEY_RE.test(key)) return null;
  const file = themePath(key);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
    return validateConfig(raw, key);
  } catch {
    return null;
  }
}

/**
 * Is this theme a platform-bundled theme?
 *
 * Bundled themes carry a `.bundled` marker file (written by
 * scripts/scaffold-theme.mjs). The `default` fallback theme is protected
 * unconditionally, even if its marker is ever lost, because the storefront
 * must always have something to render.
 *
 * Bundled themes can never be overwritten by an install or deleted by an
 * admin — they are part of the platform release.
 */
export function isBundledTheme(key: string): boolean {
  if (key === 'default') return true;
  if (!KEY_RE.test(key)) return false;
  return fs.existsSync(path.join(themesDir(), key, '.bundled'));
}

/**
 * The full on-disk theme catalog (bundled + admin-installed), each config
 * validated against the shared shape. Malformed themes are NOT dropped
 * silently: they are reported in `invalid` so the caller can surface them
 * instead of shipping a storefront that silently falls back to `default`.
 */
export interface ThemeCatalog {
  themes: ThemeStudioConfig[];
  invalid: string[];
}

export async function listThemeConfigs(): Promise<ThemeCatalog> {
  const keys = await listThemeKeys();
  const themes: ThemeStudioConfig[] = [];
  const invalid: string[] = [];
  for (const key of keys) {
    try {
      const raw = JSON.parse(await readFile(themePath(key), 'utf8')) as unknown;
      themes.push(validateConfig(raw, key));
    } catch {
      invalid.push(key);
    }
  }
  return { themes, invalid };
}

/** Path of a theme's preview image (preview.png/jpg/webp/svg at the theme root), or null. */
export async function getThemePreviewPath(key: string, ext?: string): Promise<string | null> {
  if (!KEY_RE.test(key)) return null;
  const dir = path.join(themesDir(), key);
  if (!fs.existsSync(path.join(dir, 'theme.json'))) return null;
  const names = ext
    ? [`preview.${ext.toLowerCase()}`]
    : ['preview.png', 'preview.jpg', 'preview.jpeg', 'preview.webp', 'preview.svg'];
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Zip extraction — delegated to utils/zipPackage.ts (shared with the plugin
// installer): zip-slip, symlink and bomb guards, then a single top-level
// folder is normalized away so theme.json lands at the package root either
// way. Validation happens BEFORE anything is written to the themes dir.
// ---------------------------------------------------------------------------

/**
 * Install a theme from an uploaded .zip.
 *
 * Flow: open + validate the zip → read theme.json and validate the config →
 * check the key is not bundled → extract every entry into a temp dir →
 * atomically swap the temp dir into place (an existing installed theme of
 * the same key is replaced; a failed swap rolls back).
 *
 * Returns the validated config. Throws a readable Error on any problem —
 * nothing is written to the themes dir unless the whole package is valid.
 */
export async function installThemeFromZip(buffer: Buffer): Promise<ThemeStudioConfig> {
  if (!buffer || buffer.length === 0) throw new Error('Empty theme package');
  if (buffer.length > MAX_ZIP_BYTES) throw new Error('Theme package exceeds 10MB');

  const files = normalizeEntryPaths(await extractZipToMap(buffer), 'theme.json');

  const themeJsonRaw = files.get('theme.json');
  if (!themeJsonRaw) {
    throw new Error('Theme package must contain a theme.json at its root');
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(themeJsonRaw.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('theme.json is not valid JSON');
  }

  const key = typeof parsed.key === 'string' ? parsed.key : '';
  if (!KEY_RE.test(key)) {
    throw new Error('theme.json must declare a valid "key" (a-z, 0-9, "-", "_", max 40 chars)');
  }
  const clean = validateConfig(parsed, key);

  if (isBundledTheme(key)) {
    throw new Error(`Theme "${key}" is a bundled platform theme and cannot be overwritten by an install`);
  }

  // Extract into a sibling temp dir (same filesystem → atomic rename).
  const tmp = path.join(themesDir(), `.install-${key}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    for (const [name, content] of files) {
      // Second safety net (the entry name already passed the hostile
      // check; this guards the join itself).
      const target = path.join(tmp, name);
      const rel = path.relative(tmp, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Unsafe path in theme package: "${name}"`);
      }
      // Never let a package plant a `.bundled` marker: that flag is the
      // platform's alone. Without this, a malicious package could make
      // itself undeletable/immutable by shipping one.
      if (name === '.bundled' || name.endsWith('/.bundled')) continue;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }

    // If the package ships a preview image but the config doesn't point
    // at a servable URL, normalise it to the API-served preview route
    // (bundled themes use /themes/<key>/preview.png from Next public/;
    // runtime-installed themes cannot add files to public/, so the API
    // serves their preview instead).
    const previewName = ['preview.png', 'preview.jpg', 'preview.jpeg', 'preview.webp'].find((n) => files.has(n));
    let finalConfig: ThemeStudioConfig = clean;
    if (previewName) {
      const hasPreview = typeof parsed.preview === 'string' && parsed.preview.trim().length > 0;
      // Bundled themes reference /themes/<key>/preview.png (Next public/);
      // that path cannot exist for a runtime-installed theme, so rewrite
      // it to the API-served preview route.
      const publicPreviewPath = `/themes/${key}/${previewName.replace('jpeg', 'jpg')}`;
      if (!hasPreview || parsed.preview === publicPreviewPath) {
        parsed = { ...parsed, preview: `/api/themes/${key}/${previewName}` };
        finalConfig = { ...clean, preview: parsed.preview as string };
      }
    }
    await writeFile(path.join(tmp, 'theme.json'), JSON.stringify(parsed, null, 2), 'utf8');

    // Atomic swap: existing installed theme → backup; tmp → final; then
    // drop the backup. Any failure rolls back to the previous version.
    const finalDir = path.join(themesDir(), key);
    const backup = path.join(themesDir(), `.install-backup-${key}-${Date.now()}`);
    const hadExisting = fs.existsSync(finalDir);
    if (hadExisting) {
      await rm(backup, { recursive: true, force: true });
      await rename(finalDir, backup);
    }
    try {
      await rename(tmp, finalDir);
    } catch (e) {
      if (hadExisting) await rename(backup, finalDir).catch(() => {});
      throw e;
    }
    if (hadExisting) await rm(backup, { recursive: true, force: true });

    return finalConfig;
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

/**
 * Create or overwrite an admin theme. Writes a theme.json file into
 * <themes>/<key>/theme.json. The full config is validated against the shared
 * shape before it touches disk.
 */
export async function saveTheme(key: string, cfg: unknown): Promise<ThemeStudioConfig> {
  const clean = validateConfig(cfg, key);
  if (clean.layouts) clean.layouts = scrubStudioLayouts(clean.layouts);
  if (isBundledTheme(key)) {
    throw new Error(`Theme "${key}" is a bundled platform theme and cannot be overwritten`);
  }
  const dir = path.join(themesDir(), key);
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(clean, null, 2);
  await writeFile(path.join(dir, 'theme.json'), json, 'utf8');
  return clean;
}

/** Delete an admin theme directory. Bundled themes cannot be deleted. */
export async function deleteTheme(key: string): Promise<void> {
  if (!KEY_RE.test(key)) throw new Error('Invalid theme key');
  if (isBundledTheme(key)) {
    throw new Error(`Theme "${key}" is a bundled platform theme and cannot be deleted`);
  }
  const dir = path.join(themesDir(), key);
  if (!fs.existsSync(dir)) {
    throw new Error(`Theme "${key}" does not exist`);
  }
  await rm(dir, { recursive: true, force: true });
}
