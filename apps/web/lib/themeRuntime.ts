/**
 * Runtime theme registry — the disk-catalog overlay on top of the
 * build-time static registry.
 *
 * WHY THIS EXISTS
 * ---------------
 * The static registry (`lib/themeRegistry.ts`) compiles every theme under
 * `themes/` into the web bundle at build time. That is fast, type-safe and
 * the fallback the storefront always has — but it cannot know about a theme
 * an admin installs at runtime. The API serves the on-disk catalog (the
 * same `theme.json` files, validated) via `GET /api/themes`, and this module
 * is the bridge:
 *
 *   - `setRuntimeThemeConfig` / `fetchThemeCatalog` populate a module-level
 *     cache with configs that are NOT in the static registry (plus any
 *     bundled theme whose disk copy was edited in Theme Studio — the disk
 *     copy is authoritative for tokens/layouts at runtime).
 *   - `resolveThemeConfig(key)` is the single resolution rule used by the
 *     storefront:
 *
 *         1. runtime cache (disk config, bundled OR installed) — if present
 *         2. static registry — bundled themes, build-time fallback
 *         3. the platform `default` theme — never missing
 *
 *   - `isInstalledThemeKey(key)` replaces the old static-only
 *     `isInstalledTheme` for call sites that must also accept
 *     admin-installed themes.
 *
 * SECURITY / SCOPE NOTES
 * ----------------------
 * Installed themes are DATA, never code: the cache carries `theme.json`
 * configs (tokens + layouts), which are rendered with the platform's
 * built-in section components and block renderers. Uploaded `sections/*.tsx`
 * are stored inertly by the API and never imported here.
 *
 * The module cache is a client-side convenience (a single store per
 * install). Server components must NOT rely on it — they fetch the API
 * response directly (see `lib/layouts/serverLayout.ts` and the preview
 * page), and `fetchThemeCatalog` only writes the cache in a browser.
 */

import { THEMES, getTheme, type ThemeConfig } from './themeRegistry';
import { themeConfigSchema } from './themeConfigSchema';
import { CLIENT_API_BASE } from './apiBase';

const runtimeCache = new Map<string, ThemeConfig>();

/**
 * Parse + cache a raw on-disk theme config (from /api/theme's
 * `activeThemeConfig` or /api/themes). Returns null when the config fails
 * the same schema the build gate uses — a malformed theme is never allowed
 * to override the static registry.
 */
export function setRuntimeThemeConfig(raw: unknown): ThemeConfig | null {
  const parsed = themeConfigSchema.safeParse(raw);
  if (!parsed.success) return null;
  runtimeCache.set(parsed.data.key, parsed.data);
  return parsed.data;
}

/** Drop the runtime overlay (used on reload so stale edits never stick). */
export function clearRuntimeThemeCache(): void {
  runtimeCache.clear();
}

/**
 * Fetch the on-disk theme catalog from the API and cache every valid
 * config. Returns the parsed list plus the keys the API could not
 * validate. In a browser the cache is populated for the storefront +
 * admin; on the server (preview page) the list is returned without
 * touching the shared cache.
 */
export async function fetchThemeCatalog(): Promise<{ themes: ThemeConfig[]; invalid: string[] }> {
  const res = await fetch(`${CLIENT_API_BASE}/themes`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GET /api/themes returned ${res.status}`);
  }
  const body = (await res.json()) as { data?: { themes?: unknown[]; invalid?: string[] } };
  const themes: ThemeConfig[] = [];
  const invalid: string[] = [...(body?.data?.invalid ?? [])];
  for (const raw of body?.data?.themes ?? []) {
    const parsed = setRuntimeThemeConfig(raw);
    if (parsed) themes.push(parsed);
    else invalid.push(typeof (raw as { key?: unknown })?.key === 'string' ? ((raw as { key: string }).key) : '(unknown)');
  }
  if (typeof window === 'undefined') {
    // Server callers must not leak configs across requests via the module
    // cache; they received what they need in the return value.
    clearRuntimeThemeCache();
  }
  return { themes, invalid };
}

/**
 * The one resolution rule every storefront consumer uses. See the module
 * comment for the precedence. Never returns undefined: unknown keys fall
 * back to the platform `default` theme.
 *
 * For a BUNDLED key whose disk copy exists in the cache, the disk copy is
 * authoritative for metadata and layouts, but its tokens are MERGED over the
 * bundled base. A Studio save (or a third-party package) may legitimately
 * carry a partial token set; merging guarantees a bundled theme's identity
 * can never be stripped by an incomplete disk file, while still letting an
 * admin's edits take effect at runtime.
 */
export function resolveThemeConfig(key: string | null | undefined): ThemeConfig {
  if (key) {
    const runtime = runtimeCache.get(key);
    if (runtime) {
      const bundled = THEMES.find((t) => t.key === key);
      if (bundled) {
        return {
          ...bundled,
          ...runtime,
          tokens: { ...bundled.tokens, ...runtime.tokens },
        };
      }
      return runtime;
    }
  }
  return getTheme(key);
}

/** True when the key is a bundled theme OR a cached installed theme. */
export function isInstalledThemeKey(key: string | null | undefined): boolean {
  if (!key) return false;
  if (runtimeCache.has(key)) return true;
  return THEMES.some((t) => t.key === key);
}
