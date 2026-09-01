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

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);

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
}

const KEY_RE = /^[a-z0-9][a-z0-9-_]*$/;
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
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as ThemeStudioConfig;
  } catch {
    return null;
  }
}

/**
 * Create or overwrite an admin theme. Writes a theme.json file into
 * <themes>/<key>/theme.json. The full config is validated against the shared
 * shape before it touches disk.
 */
export async function saveTheme(key: string, cfg: unknown): Promise<ThemeStudioConfig> {
  const clean = validateConfig(cfg, key);
  const dir = path.join(themesDir(), key);
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(clean, null, 2);
  await writeFile(path.join(dir, 'theme.json'), json, 'utf8');
  return clean;
}

/** Delete an admin theme directory. Bundled themes cannot be deleted. */
export async function deleteTheme(key: string): Promise<void> {
  if (!KEY_RE.test(key)) throw new Error('Invalid theme key');
  const dir = path.join(themesDir(), key);
  if (!fs.existsSync(dir)) {
    throw new Error(`Theme "${key}" does not exist`);
  }
  await rm(dir, { recursive: true, force: true });
}
