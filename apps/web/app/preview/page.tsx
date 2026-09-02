import type { Metadata } from 'next';
import Link from 'next/link';
import { THEMES } from '@/lib/themeRegistry';
import { buildNoindexMetadata } from '@/lib/seo';

/**
 * /preview — theme gallery.
 *
 * Lists every installed theme as a card with a preview
 * image, name, description, and a "Preview" link. The
 * gallery is the landing page for the preview flow:
 * the merchant picks a theme here, lands on
 * /preview/<key>, and decides whether to activate.
 *
 * Public (no auth required). The "Activate" CTA on each
 * preview page is admin-gated; the gallery itself isn't.
 *
 * Noindex: the gallery is a merchant surface, not a
 * marketing surface. Search engines shouldn't index
 * previews; the marketplace UI (future) is the
 * crawler-visible version.
 */
export const metadata: Metadata = buildNoindexMetadata({
  title: 'Theme gallery',
  description: 'Preview every theme in the platform with sample content.',
  path: '/preview',
});

export default function PreviewGalleryPage() {
  // Sort by key for deterministic order across renders.
  const themes = [...THEMES].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div
      data-testid="preview-gallery"
      style={{
        minHeight: '100vh',
        backgroundColor: '#fafafa',
        padding: '60px 20px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 40,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 800,
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Theme gallery
          </h1>
          <p
            style={{
              fontSize: 16,
              color: '#666',
              margin: 0,
              maxWidth: 640,
              marginInlineStart: 'auto',
              marginInlineEnd: 'auto',
            }}
          >
            Every theme shipped with the platform. Click a theme to see what
            your store would look like with it active.
          </p>
        </header>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 24,
          }}
        >
          {themes.map((theme) => (
            <Link
              key={theme.key}
              href={`/preview/${theme.key}`}
              data-testid={`preview-gallery-card-${theme.key}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#fff',
                borderRadius: 12,
                border: '1px solid #e5e5e5',
                overflow: 'hidden',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              }}
            >
              <div
                style={{
                  aspectRatio: '2 / 1',
                  backgroundColor: '#e5e5e5',
                  backgroundImage: `url(${theme.preview})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{theme.name}</h2>
                  {theme.features.paid && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: '#92400e',
                        backgroundColor: '#fef3c7',
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      Paid
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 14, color: '#666', margin: 0, lineHeight: 1.5 }}>
                  {theme.description}
                </p>
                <p style={{ fontSize: 12, color: '#999', margin: 0, marginTop: 4 }}>
                  v{theme.version} · {theme.author}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
