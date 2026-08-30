/**
 * Zod schema for theme.json files.
 *
 * The schema is the single source of truth for "what a valid
 * theme looks like." Used in two places:
 *   1. themeRegistry.ts — validates each entry in the THEMES
 *      array at module load. A typo in a theme field fails the
 *      build, not the storefront.
 *   2. (Future) tools/scaffold-theme.ts — `npm run new-theme`
 *      uses the schema to validate the freshly-written
 *      theme.json before committing.
 *
 * Why a Zod schema when there's already a TypeScript interface?
 *   - TypeScript's `as unknown as ThemeConfig` cast in the
 *     registry is a code smell. The cast tells you the
 *     developer is uncertain about the JSON's actual shape.
 *   - A schema gives you a parse step: if theme.json is
 *     missing a required field, the parse fails with a clear
 *     path (`/tokens/primaryColor: Required`) instead of a
 *     runtime "undefined.primaryColor" later.
 *   - Zod's `.strict()` rejects unknown keys. The TypeScript
 *     type can't catch a typo like `featrues: true` because
 *     excess property checks only fire on object literals,
 *     not on parsed JSON.
 *   - Tests can pin the schema's behaviour without touching
 *     the filesystem: feed a malformed object, assert the
 *     error, done.
 *
 * The schema is exported separately from the registry so it
 * can be tested in isolation and reused by tooling.
 */

import { z } from 'zod';

/**
 * The token value type.
 *
 * Tokens are the design knobs a theme controls: a colour, a
 * number (radius, font size), or a boolean (show trust bar?).
 * The runtime `Theme` interface flattens them; the schema
 * keeps them in a generic map for forward-compatibility.
 *
 * Why allow `boolean`? Some section toggles are "show this
 * row" (boolean), not "render this colour." The theme decides
 * what shape its tokens take; the platform just hands them
 * through to the runtime.
 */
const themeTokenSchema = z.union([z.string(), z.number(), z.boolean()]);

/**
 * Features the theme supports.
 *
 * `rtl` controls whether the storefront's `dir="rtl"` is applied
 * for this theme. Themes that don't support RTL get a flash of
 * LTR content when a Kurdish or Arabic visitor arrives.
 *
 * `darkMode` is informational for now. The platform doesn't yet
 * have a dark mode toggle, but the registry tracks the
 * capability so the admin can show a "Dark mode ready" badge.
 *
 * `paid` controls whether the marketplace gates this theme
 * behind a license check. A `false` here means the theme
 * ships free; a `true` means the platform's license check
 * applies.
 */
const themeFeaturesSchema = z
  .object({
    rtl: z.boolean(),
    darkMode: z.boolean(),
    paid: z.boolean(),
  })
  .strict();

/**
 * A single theme config.
 *
 * The `key` is the URL-safe identifier (e.g. "default",
 * "minimal", "bold"). It must be unique across the registry
 * (enforced at module load, see THEMES below).
 *
 * The `version` is a semver string. The platform doesn't
 * currently do anything with it; it's metadata for theme
 * authors to track breaking changes.
 *
 * The `preview` is a path or URL to a screenshot. Resolved at
 * runtime; the platform doesn't validate it exists. A missing
 * preview image shows a placeholder in the admin gallery.
 *
 * `sections` is the section override map. Each key is a
 * section name the platform knows about ("hero", "featured",
 * "categories"); each value is a logical component key the
 * platform resolves via the static import map in
 * `themeSections.tsx`. A theme can ship a path to a component
 * that doesn't exist; the resolver returns `null` and the
 * home page falls through to the platform default.
 */
export const themeConfigSchema = z
  .object({
    key: z
      .string()
      .min(1, 'Theme key must not be empty')
      .max(40, 'Theme key must be 40 chars or fewer')
      // URL-safe characters only. The platform uses the key in
      // URL paths (e.g. /preview/<key>), file names, and the
      // activeTheme database column.
      .regex(/^[a-z0-9][a-z0-9-_]*$/, 'Theme key must be lowercase a-z, 0-9, "-", or "_"'),
    name: z.string().min(1, 'Theme name must not be empty').max(80),
    description: z.string().min(1, 'Theme description must not be empty').max(500),
    version: z
      .string()
      // Full semver: MAJOR.MINOR.PATCH with optional pre-release
      // (-foo.bar) and/or build metadata (+abc.123). The optional
      // groups are both preceded by their separator so a
      // version like `1.0.0-beta+build.42` parses; we
      // deliberately don't require both to be present.
      .regex(
        /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/,
        'Theme version must be semver (e.g. 1.0.0, 2.1.0-beta.1)',
      ),
    author: z.string().min(1).max(120),
    preview: z.string().min(1),
    features: themeFeaturesSchema,
    tokens: z.record(z.string(), themeTokenSchema),
    sections: z.record(z.string(), z.string()).optional(),
  })
  .strict();

/**
 * The TypeScript type for a parsed ThemeConfig.
 *
 * Inferred from the Zod schema. Used in `themeRegistry.ts`
 * for the `THEMES` array and the public exports.
 */
export type ThemeConfig = z.infer<typeof themeConfigSchema>;
