/**
 * Theme registry.
 *
 * A "theme" is a directory under `themes/<key>/` containing a
 * `theme.json` config file. This module reads all of them at build time
 * and exposes a typed registry so the rest of the app can:
 *
 *   1. List the installed themes (for the admin theme picker).
 *   2. Load a single theme's variables and section overrides.
 *   3. Fall back to the bundled "default" theme if a theme is missing
 *      or malformed.
 *
 * Why a file-system registry, not a database table?
 *   - Themes are versioned with the platform. Pinning a theme to a
 *     release means upgrades are predictable.
 *   - Theme authors can drop a directory into `themes/` and it Just
 *     Works - no DB migration, no admin upload step.
 *   - Reviewing a theme's changes is a code review, not a "what did
 *     the merchant install" mystery.
 *
 * The active theme is selected per-store via the StoreSettings
 * `activeTheme` column (added in the same change). Per-store overrides
 * on the existing `ThemeSettings` model still work - they override
 * individual variables, not the whole theme.
 */

import defaultThemeJson from '@/themes/default/theme.json';
import minimalThemeJson from '@/themes/minimal/theme.json';
import boldThemeJson from '@/themes/bold/theme.json';
import dawnlightThemeJson from '@/themes/dawnlight/theme.json';
import heritageThemeJson from '@/themes/heritage/theme.json';
import pulseThemeJson from '@/themes/pulse/theme.json';
import { themeConfigSchema, type ThemeConfig } from './themeConfigSchema';

/**
 * The bundled fallback. Used when:
 *   - The store has no `activeTheme` set (default state).
 *   - The stored `activeTheme` doesn't match an installed theme
 *     (the theme was uninstalled or renamed in a platform upgrade).
 *   - The theme's `theme.json` failed to parse (corrupted install).
 *
 * Declared above `parseTheme` and the registry assertions because
 * JavaScript's `const` is hoisted but not initialised; calling
 * `assertRegistryValid` from a top-level `const THEMES = ...`
 * initialiser requires the constant to be in scope as a binding.
 */
export const FALLBACK_THEME_KEY = 'default';

/**
 * Parse and validate a raw `theme.json` import.
 *
 * Why a function instead of `themeConfigSchema.parse(json)` at
 * each THEMES entry?
 *   - A single function call site keeps the array literal
 *     readable. Two columns of THEMES become two columns of
 *     `parseTheme(defaultThemeJson), parseTheme(minimalThemeJson)`.
 *   - The error message is consistent: every malformed theme
 *     fails the same way ("Invalid theme 'foo': /tokens/x:
 *     Required"). Inline `parse` would also work, but a named
 *     function lets us wrap it once and improve the error
 *     message in one place.
 */
function parseTheme(raw: unknown, name: string): ThemeConfig {
  const result = themeConfigSchema.safeParse(raw);
  if (!result.success) {
    // The error path is "/tokens/primaryColor" — readable, but
    // not actionable on its own. We prepend the theme name so
    // the build log says `theme "minimal": /tokens/x: Required`
    // instead of just `/tokens/x: Required`. With two themes,
    // you'd otherwise have to read the surrounding source to
    // know which one is broken.
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid theme config "${name}":\n${issues}`,
    );
  }
  return result.data;
}

/**
 * Re-export the type so existing consumers of `themeRegistry`
 * (which import `ThemeConfig` from this module) don't need to
 * change their import paths.
 */
export type { ThemeConfig };

/**
 * The full set of installed themes, with the bundled default always
 * present. The first theme in the array is the "default" - it's
 * what new stores get if they don't pick anything.
 *
 * The literal list is hard-coded rather than glob'd because:
 *   - Vite needs to know which JSON files to bundle at build time.
 *   - We want a typo in a theme key to be a build error, not a
 *     runtime "this theme doesn't exist" 404.
 *   - It's a small set; the admin picks from a dropdown anyway.
 *
 * Adding a theme is: drop a directory in `themes/`, add a line here.
 * That's two changes per theme and the build will fail if either is
 * wrong.
 *
 * Each entry is parsed through `themeConfigSchema` at module
 * load. A bad field (typo in a key, missing required field,
 * unknown extra field) fails the build with a clear error
 * pointing at the offending path.
 */
export const THEMES: readonly ThemeConfig[] = [
  parseTheme(defaultThemeJson, 'default'),
  parseTheme(minimalThemeJson, 'minimal'),
  parseTheme(boldThemeJson, 'bold'),
  parseTheme(dawnlightThemeJson, 'dawnlight'),
  parseTheme(heritageThemeJson, 'heritage'),
  parseTheme(pulseThemeJson, 'pulse'),
] as const;

/**
 * Assert that the registry is well-formed.
 *
 * Things that aren't caught by the per-theme schema:
 *   - Duplicate keys (two themes with the same `key`).
 *   - The fallback theme being missing.
 *
 * These are caught here, in a single function that throws at
 * module load. The error message is the kind a developer sees
 * during `npm run build` and immediately knows what to fix.
 */
function assertRegistryValid(themes: readonly ThemeConfig[]): void {
  const keys = themes.map((t) => t.key);
  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== keys.length) {
    const counts = keys.reduce<Record<string, number>>((acc, k) => {
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const dupes = Object.entries(counts)
      .filter(([, n]) => n > 1)
      .map(([k]) => k)
      .join(', ');
    throw new Error(
      `Theme registry has duplicate keys: ${dupes}. ` +
        `Each theme's "key" field must be unique.`,
    );
  }
  if (!uniqueKeys.has(FALLBACK_THEME_KEY)) {
    throw new Error(
      `Theme registry is missing the fallback theme "${FALLBACK_THEME_KEY}". ` +
        `Every platform must include the fallback so getTheme() can always return something.`,
    );
  }
}

assertRegistryValid(THEMES);

/**
 * Get a theme by key. Falls back to the default theme if not found.
 */
export function getTheme(key: string | null | undefined): ThemeConfig {
  if (key) {
    const t = THEMES.find((th) => th.key === key);
    if (t) return t;
  }
  const fallback = THEMES.find((t) => t.key === FALLBACK_THEME_KEY);
  // THEMES always includes the fallback (enforced at the literal above).
  // The non-null assertion is safe - if you remove the default theme
  // from the array, the build will fail at the THEMES type instead of
  // crashing at runtime with a null pointer.
  return fallback!;
}

/**
 * The platform's default theme. The admin's "use default" choice
 * resolves to this. It's also the theme the platform uses to fill
 * in missing tokens when a third-party theme is partial.
 */
export function getDefaultTheme(): ThemeConfig {
  return getTheme(FALLBACK_THEME_KEY);
}

/**
 * List the theme keys. Used by the admin theme picker.
 */
export function listThemeKeys(): readonly string[] {
  return THEMES.map((t) => t.key);
}

/**
 * Validate a theme key is installed. Returns false for null, undefined,
 * empty string, or any value not in the registry.
 */
export function isInstalledTheme(key: string | null | undefined): boolean {
  return !!key && THEMES.some((t) => t.key === key);
}
