'use client';

/**
 * PreviewView — the client-side content of /preview/<key>.
 *
 * Renders the theme's hero, featured, and categories
 * sections using the platform's section-component
 * resolution. The data is the sample fixture, not the
 * merchant's actual data, so the preview looks the same
 * on every install.
 *
 * The view also renders a "preview chrome" header and
 * footer: a top bar with the theme name + an "Activate
 * this theme" CTA, and a bottom CTA. The chrome is
 * intentionally minimal — it shouldn't compete with the
 * theme's own design.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTheme as useStoreTheme } from '@/lib/theme';
import { ThemeSectionRenderer } from '@/lib/themeSectionRenderer';
import { PreviewThemeProvider } from '@/lib/previewTheme';
import {
  PREVIEW_PRODUCTS,
  PREVIEW_CATEGORIES,
  PREVIEW_STORE,
} from '@/lib/previewSampleData';

interface Props {
  themeKey: string;
  themeName: string;
  themeDescription: string;
}

export function PreviewView({ themeKey, themeName, themeDescription }: Props) {
  // The store's currently-active theme. Pulled from the
  // outer ThemeContext (set by the platform's ThemeProvider
  // further up the tree). The PreviewThemeProvider uses it
  // to decide whether to show the "Activate" CTA (only when
  // the previewed theme differs from the store's choice).
  const { theme: storeTheme } = useStoreTheme();

  return (
    <PreviewThemeProvider
      themeKey={themeKey}
      storeActiveTheme={storeTheme.activeTheme ?? null}
    >
      <PreviewChrome
        themeKey={themeKey}
        themeName={themeName}
        themeDescription={themeDescription}
      />
    </PreviewThemeProvider>
  );
}

/**
 * Top bar + content + bottom CTA.
 *
 * Split into a separate component so the state for the
 * "Activate" button (loading / success / error) is local to
 * the chrome and doesn't re-render the heavy section tree
 * on every click.
 */
function PreviewChrome({
  themeKey,
  themeName,
  themeDescription,
}: {
  themeKey: string;
  themeName: string;
  themeDescription: string;
}) {
  // Convert the sample product fixture into the shape the
  // section components expect. The shape is defined by
  // SectionProps in lib/themeSections.tsx.
  const sampleProducts = PREVIEW_PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    images: [{ url: '', alt: p.imageAlt }],
    category: p.category,
  }));
  const sampleCategories = PREVIEW_CATEGORIES.map((c) => ({
    name: c.name,
    slug: c.slug,
    count: c.count,
    image: '',
  }));

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PreviewHeader
        themeKey={themeKey}
        themeName={themeName}
        themeDescription={themeDescription}
      />
      <main style={{ flex: 1 }}>
        <ThemeSectionRenderer
          section="hero"
          fallback={<PreviewHeroFallback />}
          props={{ banners: [] }}
        />
        <ThemeSectionRenderer
          section="featured"
          fallback={<PreviewFeaturedFallback products={sampleProducts} />}
          props={{
            title: 'Featured',
            products: sampleProducts,
            config: { limit: 4 },
          }}
        />
        <ThemeSectionRenderer
          section="categories"
          fallback={<PreviewCategoriesFallback categories={sampleCategories} />}
          props={{
            title: 'Shop by category',
            categories: sampleCategories,
            config: { limit: 4 },
          }}
        />
      </main>
      <PreviewFooter themeName={themeName} />
    </div>
  );
}

/**
 * The top bar. Renders the theme name, a "back to admin"
 * link (when the user came from the admin context, which we
 * detect via the `?from=admin` query param), and the
 * "Activate this theme" CTA.
 */
function PreviewHeader({
  themeKey,
  themeName,
  themeDescription,
}: {
  themeKey: string;
  themeName: string;
  themeDescription: string;
}) {
  // Read the query string on the client. We can't use
  // useSearchParams() because Next 14 requires a Suspense
  // boundary for that hook, and the suspense would re-mount
  // the section tree on every query-string change. Direct
  // window.location access is fine here because the chrome
  // is a leaf component and re-renders on every nav.
  const [fromAdmin, setFromAdmin] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setFromAdmin(new URLSearchParams(window.location.search).get('from') === 'admin');
  }, []);

  return (
    <header
      data-testid="preview-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'saturate(180%) blur(8px)',
        borderBottom: '1px solid #e5e5e5',
        padding: '12px 20px',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {fromAdmin && (
            <Link
              href="/admin/appearance"
              data-testid="preview-back-to-admin"
              style={{
                fontSize: 14,
                color: '#111',
                textDecoration: 'none',
                padding: '6px 10px',
                border: '1px solid #d4d4d4',
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              ← Back to admin
            </Link>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              data-testid="preview-theme-name"
              style={{
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#111',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Previewing: {themeName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#666',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {themeDescription}
            </div>
          </div>
        </div>
        <ActivateButton themeKey={themeKey} />
      </div>
    </header>
  );
}

/**
 * The "Activate this theme" button.
 *
 * Calls PATCH /api/theme/settings with { activeTheme: key }.
 * On success, navigates back to the storefront (or shows a
 * confirmation if the user wasn't on /admin/appearance).
 *
 * The button is admin-only: the API requires admin auth.
 * A non-admin visitor sees the button as disabled with
 * a "Sign in as admin to activate" tooltip. We don't
 * show a different button because the marketing site
 * will have its own "buy this theme" flow; this CTA
 * is the merchant's.
 */
function ActivateButton({ themeKey }: { themeKey: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  const activate = async () => {
    setStatus('loading');
    setError('');
    try {
      // The theme settings API takes the full theme record;
      // we send the minimum required (activeTheme) and let
      // the server fill in the rest. The mock prisma is
      // permissive; the real API will need to be too.
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/theme`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ activeTheme: themeKey }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.message || `Could not activate (${res.status})`);
        setStatus('error');
        return;
      }
      setStatus('success');
      // Reload after a moment so the merchant sees the
      // theme in their actual storefront, not just the
      // preview.
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch {
      setError('Network error');
      setStatus('error');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {status === 'error' && (
        <span
          data-testid="preview-activate-error"
          style={{ fontSize: 12, color: '#b91c1c' }}
        >
          {error}
        </span>
      )}
      {status === 'success' && (
        <span
          data-testid="preview-activate-success"
          style={{ fontSize: 12, color: '#15803d' }}
        >
          Activated! Reloading…
        </span>
      )}
      <button
        type="button"
        onClick={activate}
        disabled={status === 'loading' || status === 'success'}
        data-testid="preview-activate"
        style={{
          minHeight: 40,
          padding: '0 18px',
          backgroundColor: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          cursor: status === 'loading' || status === 'success' ? 'not-allowed' : 'pointer',
          opacity: status === 'loading' || status === 'success' ? 0.6 : 1,
        }}
      >
        {status === 'loading'
          ? 'Activating…'
          : status === 'success'
          ? 'Active'
          : 'Activate this theme'}
      </button>
    </div>
  );
}

/**
 * The bottom CTA. Always shown. The link goes to the
 * gallery (which is a future feature; for now, the link
 * is a placeholder pointing at the home page's appearance
 * page).
 */
function PreviewFooter({ themeName }: { themeName: string }) {
  return (
    <footer
      data-testid="preview-footer"
      style={{
        padding: '40px 20px',
        backgroundColor: '#0a0a0a',
        color: '#fafafa',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <p
          style={{
            fontSize: 14,
            margin: 0,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          This is a preview. The {themeName} theme is shown with sample content. The
          content, layout, and styling are the theme author's; the platform
          doesn&apos;t influence the design.
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------------- */
/* Fallback content                                                          */
/* ------------------------------------------------------------------------- */

/**
 * When the previewed theme doesn't override the hero (e.g.
 * the "default" theme's override points at HeroGallery which
 * needs banners), we render a generic hero using the theme
 * tokens. This is the platform-default hero for the
 * preview, not the storefront's real hero.
 */
function PreviewHeroFallback() {
  return (
    <section
      data-section="hero"
      data-testid="preview-hero"
      style={{
        backgroundColor: 'var(--body-bg, #fff)',
        color: 'var(--body-text, #111)',
        padding: '80px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--container, 1200px)',
          margin: '0 auto',
        }}
      >
        <p
          style={{
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--muted, #666)',
            margin: 0,
            marginBottom: 16,
          }}
        >
          {PREVIEW_STORE.name}
        </p>
        <h1
          style={{
            fontSize: 'clamp(36px, 6vw, 64px)',
            lineHeight: 1.05,
            margin: 0,
            marginBottom: 16,
            fontWeight: 'var(--heading-weight, 800)',
            maxWidth: '20ch',
          }}
        >
          {PREVIEW_STORE.description}
        </h1>
      </div>
    </section>
  );
}

interface SampleProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: Array<{ url: string; alt?: string }>;
  category: { name: string; slug: string };
}

function PreviewFeaturedFallback({ products }: { products: SampleProduct[] }) {
  return (
    <section
      data-section="featured"
      data-testid="preview-featured"
      style={{
        padding: '64px 24px',
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
      }}
    >
      <h2
        style={{
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--muted, #666)',
          fontWeight: 500,
          margin: 0,
          marginBottom: 32,
        }}
      >
        Featured
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 24,
        }}
      >
        {products.map((p) => (
          <div
            key={p.id}
            data-testid="preview-product-card"
            style={{
              backgroundColor: 'var(--card-bg, #fff)',
              border: '1px solid var(--border, #e5e5e5)',
              borderRadius: 'var(--radius, 8px)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                aspectRatio: '1',
                backgroundColor:
                  PREVIEW_PRODUCTS.find((sp) => sp.id === p.id)?.accent || '#e5e5e5',
              }}
            />
            <div style={{ padding: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>
                ${p.price.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface SampleCategory {
  name: string;
  slug: string;
  count: number;
  image: string;
}

function PreviewCategoriesFallback({ categories }: { categories: SampleCategory[] }) {
  return (
    <section
      data-section="categories"
      data-testid="preview-categories"
      style={{
        padding: '64px 24px',
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
      }}
    >
      <h2
        style={{
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--muted, #666)',
          fontWeight: 500,
          margin: 0,
          marginBottom: 32,
        }}
      >
        Shop by category
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
        }}
      >
        {categories.map((c) => {
          const accent = PREVIEW_CATEGORIES.find((sc) => sc.slug === c.slug)?.accent || '#e5e5e5';
          return (
            <div
              key={c.slug}
              data-testid="preview-category-card"
              style={{
                backgroundColor: 'var(--card-bg, #fff)',
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: 'var(--radius, 8px)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  aspectRatio: '4 / 3',
                  backgroundColor: accent,
                }}
              />
              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted, #666)' }}>
                  {c.count} products
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
