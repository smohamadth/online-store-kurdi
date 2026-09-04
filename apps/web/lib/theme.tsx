'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  THEMES,
  getDefaultTheme,
  getTheme,
  type ThemeConfig,
} from './themeRegistry';
import {
  isInstalledThemeKey,
  resolveThemeConfig,
  setRuntimeThemeConfig,
} from './themeRuntime';

/**
 * The `Theme` interface is the *runtime* shape: the flattened,
 * ready-to-apply set of design tokens the storefront uses. The
 * raw `ThemeConfig` (in themeRegistry.ts) is the on-disk shape; it
 * can be partial. The `Theme` is what you get after merging a
 * config with per-store overrides and filling in defaults.
 *
 * The interface below is unchanged from before the theme system
 * was multi-theme aware. New code reads `tokens` from
 * `ThemeConfig` directly; the existing `useTheme()` consumers
 * continue to work because the merged shape is the same.
 */
export interface Theme {
  primaryColor: string;
  primaryTextColor: string;
  accentColor: string;
  bodyBg: string;
  cardBg: string;
  bodyText: string;
  mutedText: string;
  borderColor: string;
  headerBg: string;
  headerText: string;
  footerBg: string;
  footerText: string;
  priceColor: string;
  saleColor: string;

  fontFamily: string;
  baseFontSize: number;
  headingWeight: number;

  radius: number;
  buttonRadius: number;
  containerWidth: number;
  cardShadow: 'none' | 'soft' | 'strong';

  productsPerRow: number;
  showTrustBar: boolean;
  showTestimonials: boolean;
  showStats: boolean;
  showNewsletter: boolean;
  showDealCountdown: boolean;
  showCategories: boolean;
  showFeatured: boolean;
  showNewArrivals: boolean;

  announcementText: string | null;
  announcementLink: string | null;
  announcementBg: string;
  announcementText2: string;
  showAnnouncement: boolean;

  customCss: string | null;

  /**
   * The key of the active theme. New in the multi-theme system.
   * Consumers can read this to know which theme is rendering and
   * to look up section overrides via themeRegistry.
   */
  activeTheme: string;
}

/** Same denylist as the API GET /theme scrub — cached or poisoned CSS must not inject scripts. */
const DANGEROUS_CSS =
  /<\/?script|javascript:|expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import|behavior\s*:|-moz-binding/i;

export function scrubCustomCss(css: string | null | undefined): string | null {
  if (css == null || css === '') return css ?? null;
  return DANGEROUS_CSS.test(css) ? null : css;
}

/**
 * Default theme tokens, derived from the bundled default theme
 * config. This is what every store starts with before the admin
 * has touched anything. Same shape as before so the CSS variable
 * emitter doesn't need to change.
 *
 * Exported so callers that need a `Theme` from a `ThemeConfig`
 * without going through the API (e.g. the theme preview page)
 * can do so. The function is pure.
 */
export function tokensToTheme(activeTheme: ThemeConfig, customizations: Partial<Theme> = {}): Theme {
  const t = activeTheme.tokens;
  // The customizations may include `activeTheme` (e.g. an old
  // call site that hasn't been updated to destruct it out).
  // We strip it so the config's authoritative `activeTheme.key`
  // is the only source of truth. A future API that wants to
  // let callers override the active theme should use a
  // separate parameter (e.g. `forceActiveTheme`) so the
  // contract is explicit.
  const {
    activeTheme: _ignoredActiveTheme,
    customCss: rawCustomCss,
    ...safeCustomizations
  } = customizations;
  return {
    primaryColor: (t.primaryColor as string) ?? '#111111',
    primaryTextColor: (t.primaryTextColor as string) ?? '#ffffff',
    accentColor: (t.accentColor as string) ?? '#2563eb',
    bodyBg: (t.bodyBg as string) ?? '#ffffff',
    cardBg: (t.cardBg as string) ?? '#ffffff',
    bodyText: (t.bodyText as string) ?? '#111111',
    mutedText: (t.mutedText as string) ?? '#6b7280',
    borderColor: (t.borderColor as string) ?? '#e5e7eb',
    headerBg: (t.headerBg as string) ?? '#ffffff',
    headerText: (t.headerText as string) ?? '#111111',
    footerBg: (t.footerBg as string) ?? '#f9fafb',
    footerText: (t.footerText as string) ?? '#111111',
    priceColor: (t.priceColor as string) ?? '#111111',
    saleColor: (t.saleColor as string) ?? '#dc2626',
    fontFamily: (t.fontFamily as string) ?? 'system',
    baseFontSize: (t.baseFontSize as number) ?? 16,
    headingWeight: (t.headingWeight as number) ?? 800,
    radius: (t.radius as number) ?? 8,
    buttonRadius: (t.buttonRadius as number) ?? 8,
    containerWidth: (t.containerWidth as number) ?? 1200,
    cardShadow: (t.cardShadow as 'none' | 'soft' | 'strong') ?? 'soft',
    productsPerRow: (t.productsPerRow as number) ?? 4,
    showTrustBar: (t.showTrustBar as boolean) ?? true,
    showTestimonials: (t.showTestimonials as boolean) ?? true,
    showStats: (t.showStats as boolean) ?? true,
    showNewsletter: (t.showNewsletter as boolean) ?? true,
    showDealCountdown: (t.showDealCountdown as boolean) ?? true,
    showCategories: (t.showCategories as boolean) ?? true,
    showFeatured: (t.showFeatured as boolean) ?? true,
    showNewArrivals: (t.showNewArrivals as boolean) ?? true,
    announcementText: null,
    announcementLink: null,
    announcementBg: (t.announcementBg as string) ?? '#111111',
    announcementText2: (t.announcementText2 as string) ?? '#ffffff',
    showAnnouncement: false,
    customCss: null,
    ...safeCustomizations,
    customCss: scrubCustomCss(
      (safeCustomizations as Partial<Theme>).customCss ?? null,
    ),
    // activeTheme is always the config's key. The customizations
    // cannot override it (we strip it above). This is the
    // single source of truth for which theme is active.
    activeTheme: activeTheme.key,
  };
}

/**
 * Backwards-compat default. Returns the same shape as the old
 * `DEFAULT_THEME` constant, but driven by the registry so
 * `DEFAULT_THEME.activeTheme === 'default'` and tokens match the
 * default theme's config.
 */
export const DEFAULT_THEME: Theme = tokensToTheme(getDefaultTheme());

/**
 * Arabic-script fallback, appended to every stack.
 *
 * font-family is resolved PER GLYPH: Latin text is picked up by the
 * stack's own fonts, and Arabic-script letters (Kurdish/Arabic) skip
 * every font that lacks them and land on the first that has them -
 * so even the "system" choice renders Kurdish professionally, and the
 * dedicated Kurdish faces below get a consistent second opinion.
 * The variables are set by next/font in app/layout.tsx.
 */
const ARABIC_FALLBACK = 'var(--font-vazirmatn), var(--font-noto-naskh-arabic)';

export const FONT_STACKS: Record<string, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, ${ARABIC_FALLBACK}, sans-serif`,
  inter: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ${ARABIC_FALLBACK}, sans-serif`,
  georgia: `Georgia, Cambria, "Times New Roman", Times, ${ARABIC_FALLBACK}, serif`,
  mono: `"SF Mono", ui-monospace, Menlo, Consolas, "Courier New", ${ARABIC_FALLBACK}, monospace`,
  rounded: `"Trebuchet MS", "Segoe UI", Verdana, ${ARABIC_FALLBACK}, sans-serif`,
  tahoma: `Tahoma, Verdana, Segoe, ${ARABIC_FALLBACK}, sans-serif`,
  // ----- Kurdish / Arabic-script faces (see app/layout.tsx) ----------
  vazirmatn: `var(--font-vazirmatn), var(--font-noto-naskh-arabic), sans-serif`,
  'noto-naskh': `var(--font-noto-naskh-arabic), var(--font-vazirmatn), sans-serif`,
  'noto-kufi': `var(--font-noto-kufi-arabic), var(--font-vazirmatn), sans-serif`,
  readex: `var(--font-readex-pro), var(--font-vazirmatn), sans-serif`,
  cairo: `var(--font-cairo), var(--font-vazirmatn), sans-serif`,
  tajawal: `var(--font-tajawal), var(--font-vazirmatn), sans-serif`,
};

/** Human labels for the Appearance → Typography select (FONT_STACKS is the machine map). */
export const FONT_LABELS: Record<string, string> = {
  vazirmatn: 'Vazirmatn — کوردی · فارسی · English (recommended for Kurdish)',
  'noto-naskh': 'Noto Naskh Arabic — کوردی · عربية',
  'noto-kufi': 'Noto Kufi Arabic — کوردی · عربية',
  readex: 'Readex Pro — کوردی · عربية',
  cairo: 'Cairo — کوردی · عربية',
  tajawal: 'Tajawal — کوردی · عربية',
  system: 'System',
  inter: 'Inter',
  georgia: 'Georgia (serif)',
  mono: 'Monospace',
  rounded: 'Rounded (Trebuchet)',
  tahoma: 'Tahoma',
};

const SHADOWS: Record<string, string> = {
  none: 'none',
  soft: '0 1px 3px rgba(0,0,0,0.06)',
  strong: '0 10px 30px rgba(0,0,0,0.12)',
};

const SHADOW_HOVER: Record<string, string> = {
  none: 'none',
  soft: '0 12px 28px rgba(0,0,0,0.10)',
  strong: '0 18px 44px rgba(0,0,0,0.18)',
};

/** Turn the theme into the CSS custom properties the storefront reads. */
export function themeToCssVars(t: Theme): string {
  return `
    --brand: ${t.primaryColor};
    --brand-text: ${t.primaryTextColor};
    --accent: ${t.accentColor};
    --body-bg: ${t.bodyBg};
    --card-bg: ${t.cardBg || t.bodyBg};
    --body-text: ${t.bodyText};
    --muted: ${t.mutedText};
    --border: ${t.borderColor};
    --header-bg: ${t.headerBg};
    --header-text: ${t.headerText};
    --footer-bg: ${t.footerBg};
    --footer-text: ${t.footerText};
    --price: ${t.priceColor};
    --sale: ${t.saleColor};
    --font: ${FONT_STACKS[t.fontFamily] || FONT_STACKS.system};
    --font-size: ${t.baseFontSize}px;
    --heading-weight: ${t.headingWeight};
    --radius: ${t.radius}px;
    --btn-radius: ${t.buttonRadius}px;
    --container: ${t.containerWidth}px;
    --shadow: ${SHADOWS[t.cardShadow] || SHADOWS.soft};
    --shadow-hover: ${SHADOW_HOVER[t.cardShadow] || SHADOW_HOVER.soft};

    --brand-hover: color-mix(in srgb, ${t.primaryColor}, #000 12%);
    --brand-active: color-mix(in srgb, ${t.primaryColor}, #000 20%);
    --surface-2: color-mix(in srgb, ${t.bodyText} 4%, ${t.cardBg || t.bodyBg});
    --success: #16a34a;
    --danger: ${t.saleColor || '#dc2626'};
    --warning: #d97706;
    --link: ${t.accentColor};
    --focus-ring: color-mix(in srgb, ${t.accentColor} 70%, transparent);
    --transition: 0.18s ease;
  `;
}

interface Ctx {
  theme: Theme;
  loading: boolean;
  reload: () => void;
  /** The key of the active theme (e.g. "bold"). Convenience mirror of
      * `theme.activeTheme` so consumers can read it straight off the
      * context without unwrapping the theme object. */
  activeTheme?: string;
}

const ThemeContext = createContext<Ctx>({
  theme: DEFAULT_THEME,
  loading: true,
  reload: () => {},
});

/**
 * Re-export the context so other providers (notably the
 * preview provider) can layer a forced theme value on
 * top of the platform's `ThemeProvider`. The context
 * shape is internal but the consumer (`useTheme`) is
 * the public API.
 */
export { ThemeContext };

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${API_URL}/theme`, { cache: 'no-store' });
      if (res.ok) {
        const { data } = await res.json();
        if (data) {
          // Read which theme this store picked. New column on the API
          // response. Falls back to the bundled default if the column
          // doesn't exist (older API builds).
          const activeKey = (data.activeTheme as string) ?? 'default';
          // The API returns the active theme's on-disk config (bundled or
          // admin-installed). Cache it so tokens AND layouts resolve for
          // installed themes without a web rebuild.
          if (data.activeThemeConfig) {
            setRuntimeThemeConfig(data.activeThemeConfig);
          }
          const safeKey = isInstalledThemeKey(activeKey) ? activeKey : 'default';
          const config = resolveThemeConfig(safeKey);
          // Build the merged theme: tokens from the config, per-store
          // overrides from the API. The keys in `data` are the same
          // shape as `Theme` minus `activeTheme`; we filter the
          // activeTheme out so the config wins.
          const { activeTheme: _ignored, ...overrides } = data;
          const merged = tokensToTheme(config, overrides as Partial<Theme>);
          setTheme(merged);
          // Cache so the next paint starts from the admin's theme, not
          // the shipped default (avoids a flash of the wrong brand
          // colour).
          localStorage.setItem('themeSettings', JSON.stringify(merged));
        }
      } else {
        // A non-2xx is a real failure. Say so once in the console:
        // silently keeping the cached theme is what made a broken
        // API look like "the appearance settings don't save".
        console.error(
          `[theme] GET ${API_URL}/theme returned ${res.status}. ` +
            'The storefront is showing the last cached theme, not the database.'
        );
      }
    } catch (err) {
      // API unreachable - fall back to the last known good theme, but
      // make the reason visible instead of failing silently. On
      // Windows this is almost always `localhost` resolving to ::1
      // while the API bound IPv4 only.
      console.error(
        `[theme] Could not reach ${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/theme. ` +
          'Showing the cached theme. Is the API running?',
        err
      );
      try {
        const cached = localStorage.getItem('themeSettings');
        if (cached) {
          const parsed = JSON.parse(cached) as Partial<Theme>;
          const activeKey = parsed.activeTheme ?? 'default';
          const safeKey = isInstalledThemeKey(activeKey) ? activeKey : 'default';
          setTheme(tokensToTheme(resolveThemeConfig(safeKey), parsed));
        }
      } catch {
        /* ignore */
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Paint from cache immediately, then refresh from the API.
    try {
      const cached = localStorage.getItem('themeSettings');
      if (cached) {
        const parsed = JSON.parse(cached) as Partial<Theme>;
        const activeKey = parsed.activeTheme ?? 'default';
        const safeKey = isInstalledThemeKey(activeKey) ? activeKey : 'default';
        setTheme(tokensToTheme(resolveThemeConfig(safeKey), parsed));
      }
    } catch {
      /* ignore */
    }
    load();

    const onChange = () => load();
    window.addEventListener('themeChange', onChange);
    return () => window.removeEventListener('themeChange', onChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, loading, reload: load, activeTheme: theme.activeTheme }}>
      {/* Injected as real CSS so it applies to inline styles that
          reference var(--...) and to any custom CSS the admin
          writes. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `:root{${themeToCssVars(theme)}}
body{background:var(--body-bg);color:var(--body-text);font-family:var(--font);font-size:var(--font-size);}
h1,h2,h3{font-weight:var(--heading-weight);}
${scrubCustomCss(theme.customCss) || ''}`,
        }}
      />
      {children}
    </ThemeContext.Provider>
  );
}
