'use client';

/**
 * Preview theme context.
 *
 * Used by the /preview/<key> route. The page validates the
 * theme key server-side, then wraps the preview content in
 * <PreviewThemeProvider themeKey="..."> on the client. The
 * provider computes the theme from the registry (no API
 * call), injects it as the ThemeContext value, and renders
 * the section overrides using the forced theme.
 *
 * The provider does NOT replace the global ThemeProvider.
 * The page still wraps the preview inside the platform's
 * normal <ThemeProvider> (which loads the actual store's
 * theme from the API). The PreviewThemeProvider layers
 * on top: components inside the preview read from the
 * preview context, components outside it read from the
 * store theme.
 *
 * Why the layered approach?
 *   - The page chrome (admin "Back to admin" link, etc.)
 *     should still use the store's actual theme.
 *   - The preview content (hero, featured, categories) uses
 *     the previewed theme so the merchant sees what their
 *     store would look like with the new theme active.
 *
 * Sections call useSection(sectionName), which calls
 * useTheme() (the runtime context). The preview's
 * context value wins because it's the inner provider.
 */

import { ReactNode, useMemo, createContext, useContext } from 'react';
import {
  getTheme,
  isInstalledTheme,
  type ThemeConfig,
} from './themeRegistry';
import {
  tokensToTheme,
  themeToCssVars,
  type Theme,
  ThemeContext,
} from './theme';

interface PreviewThemeContextValue {
  /** The theme being previewed. */
  theme: Theme;
  /** The source config. Exposed for tests and dev tooling. */
  config: ThemeConfig;
  /**
   * True if the merchant is currently previewing a theme
   * that isn't their store's active theme. The "Activate"
   * CTA uses this to decide whether to show.
   */
  isPreviewing: boolean;
}

const PreviewThemeContext = createContext<PreviewThemeContextValue | null>(null);

/**
 * Read the preview theme, if any. Returns null when the
 * caller is outside a PreviewThemeProvider (i.e. on a
 * regular storefront page). Section components ignore this;
 * they read from ThemeContext instead, so a section
 * rendered outside a preview still works.
 */
export function usePreviewTheme(): PreviewThemeContextValue | null {
  return useContext(PreviewThemeContext);
}

interface PreviewThemeProviderProps {
  /**
   * The theme key to preview. The provider assumes the
   * server-side page handler has already validated this
   * (via isInstalledTheme / the runtime catalog) so an
   * unknown key won't reach here in production. A defensive
   * fallback to the default theme is included for safety.
   */
  themeKey: string;
  /**
   * The theme's config. For bundled themes the provider falls
   * back to the static registry; for admin-installed themes
   * the server page passes the config it resolved from the
   * runtime catalog (the client has no build-time knowledge
   * of installed themes).
   */
  themeConfig?: ThemeConfig;
  /**
   * The store's currently active theme. Used to compute
   * `isPreviewing` (and to render a "Currently active" badge
   * on the preview footer). Null if the store has no theme
   * yet (fresh install).
   */
  storeActiveTheme: string | null;
  children: ReactNode;
}

export function PreviewThemeProvider({
  themeKey,
  themeConfig,
  storeActiveTheme,
  children,
}: PreviewThemeProviderProps) {
  // Compute the preview theme synchronously. The function is
  // pure: same config + same customizations = same Theme.
  // The useMemo prevents re-computing on every render of the
  // children.
  const { theme, config, isPreviewing } = useMemo(() => {
    // The server-passed config wins (installed themes); the
    // static registry is the fallback for bundled themes.
    // Defensive fallback: if the key isn't installed at all,
    // fall back to the default. The page handler should 404
    // first, so this is a belt-and-suspenders.
    const cfg =
      themeConfig ??
      getTheme(isInstalledTheme(themeKey) ? themeKey : 'default');
    const resolvedKey = cfg.key;
    const computed = tokensToTheme(cfg);
    // isPreviewing is the "this preview differs from the
    // store" flag. The CTA hides when isPreviewing is false
    // because activating the previewed theme would be a
    // no-op. A null storeActiveTheme is treated as "store
    // has no theme yet", which means previewing 'default'
    // is the same as the store's future choice — so
    // isPreviewing should be false in that case.
    const isPreviewing =
      storeActiveTheme !== null && resolvedKey !== storeActiveTheme;
    return {
      theme: computed,
      config: cfg,
      isPreviewing,
    };
  }, [themeKey, themeConfig, storeActiveTheme]);

  return (
    <PreviewThemeContext.Provider value={{ theme, config, isPreviewing }}>
      {/* Override the inner ThemeContext with the previewed
          theme. The section components (MinimalHero, etc.)
          read from ThemeContext, so they resolve against the
          previewed theme regardless of what the store's API
          says. */}
      <ThemeContext.Provider value={{ theme, loading: false, reload: () => {}, activeTheme: theme.activeTheme }}>
        {/* The CSS variables that drive the preview styling.
            Injected as a real <style> tag so the inline-style
            var(--*) references in the section components
            resolve correctly. Scoped to a div rather than
            :root so the rest of the page (admin chrome)
            keeps the store's actual theme. */}
        <div
          data-theme-preview={config.key}
          style={{ display: 'contents' }}
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `[data-theme-preview="${config.key}"]{${themeToCssVars(theme)}} [data-theme-preview="${config.key}"] body{background:var(--body-bg);color:var(--body-text);font-family:var(--font);font-size:var(--font-size);} [data-theme-preview="${config.key}"] h1,[data-theme-preview="${config.key}"] h2,[data-theme-preview="${config.key}"] h3{font-weight:var(--heading-weight);} ${theme.customCss || ''}`,
            }}
          />
          {children}
        </div>
      </ThemeContext.Provider>
    </PreviewThemeContext.Provider>
  );
}
