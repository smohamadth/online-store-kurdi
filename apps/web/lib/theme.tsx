'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface Theme {
  primaryColor: string;
  primaryTextColor: string;
  accentColor: string;
  bodyBg: string;
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
}

export const DEFAULT_THEME: Theme = {
  primaryColor: '#111111',
  primaryTextColor: '#ffffff',
  accentColor: '#2563eb',
  bodyBg: '#ffffff',
  bodyText: '#111111',
  mutedText: '#666666',
  borderColor: '#e5e5e5',
  headerBg: '#ffffff',
  headerText: '#111111',
  footerBg: '#fafafa',
  footerText: '#111111',
  priceColor: '#111111',
  saleColor: '#dc2626',
  fontFamily: 'system',
  baseFontSize: 16,
  headingWeight: 800,
  radius: 8,
  buttonRadius: 8,
  containerWidth: 1200,
  cardShadow: 'soft',
  productsPerRow: 4,
  showTrustBar: true,
  showTestimonials: true,
  showStats: true,
  showNewsletter: true,
  showDealCountdown: true,
  showCategories: true,
  showFeatured: true,
  showNewArrivals: true,
  announcementText: null,
  announcementLink: null,
  announcementBg: '#111111',
  announcementText2: '#ffffff',
  showAnnouncement: false,
  customCss: null,
};

export const FONT_STACKS: Record<string, string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  inter: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  georgia: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: '"SF Mono", ui-monospace, Menlo, Consolas, "Courier New", monospace',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif',
  tahoma: 'Tahoma, Verdana, Segoe, sans-serif',
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
  `;
}

interface Ctx {
  theme: Theme;
  loading: boolean;
  reload: () => void;
}

const ThemeContext = createContext<Ctx>({
  theme: DEFAULT_THEME,
  loading: true,
  reload: () => {},
});

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
          setTheme({ ...DEFAULT_THEME, ...data });
          // Cache so the next paint starts from the admin's theme, not the
          // shipped default (avoids a flash of the wrong brand colour).
          localStorage.setItem('themeSettings', JSON.stringify(data));
        }
      }
    } catch {
      // API unreachable - fall back to the last known good theme.
      try {
        const cached = localStorage.getItem('themeSettings');
        if (cached) setTheme({ ...DEFAULT_THEME, ...JSON.parse(cached) });
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
      if (cached) setTheme({ ...DEFAULT_THEME, ...JSON.parse(cached) });
    } catch {
      /* ignore */
    }
    load();

    const onChange = () => load();
    window.addEventListener('themeChange', onChange);
    return () => window.removeEventListener('themeChange', onChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, loading, reload: load }}>
      {/* Injected as real CSS so it applies to inline styles that reference
          var(--...) and to any custom CSS the admin writes. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `:root{${themeToCssVars(theme)}}
body{background:var(--body-bg);color:var(--body-text);font-family:var(--font);font-size:var(--font-size);}
h1,h2,h3{font-weight:var(--heading-weight);}
${theme.customCss || ''}`,
        }}
      />
      {children}
    </ThemeContext.Provider>
  );
}
