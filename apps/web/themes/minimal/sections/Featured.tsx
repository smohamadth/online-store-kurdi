/**
 * Minimal theme — Featured products section.
 *
 * A simple, no-chrome grid: the products, their names, their
 * prices. No badges, no "Add to Cart" buttons (the product card
 * itself handles that), no hover animations beyond a subtle
 * image scale.
 *
 * The grid is `minmax(220px, 1fr)` so the columns reflow
 * gracefully on phones (1 col), tablets (2-3 col), and
 * desktop (3-4 col).
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { useStoreSettings } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function MinimalFeatured({ title, subtitle, products, config }: SectionProps) {
  const theme = useTheme();
  const { settings } = useStoreSettings();
  // Default to 4 products if the admin didn't pick a count.
  const limit = (config?.limit as number) ?? 4;
  const list = (products ?? []).slice(0, limit);

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      style={{
        // Generous padding - the minimal theme's signature is
        // "more whitespace than you think is reasonable."
        padding: '96px 24px',
        maxWidth: 'var(--container, 960px)',
        margin: '0 auto',
      }}
    >
      {title && (
        <h2
          style={{
            fontSize: '13px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--muted, #6b6b65)',
            fontWeight: 500,
            margin: 0,
            marginBottom: '48px',
            textAlign: 'center',
          }}
        >
          {title}
        </h2>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '48px 32px',
        }}
      >
        {list.map((product) => {
          const image = product.images?.[0];
          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'var(--body-text, #1a1a1a)',
              }}
            >
              <div
                style={{
                  // Square aspect ratio, subtle border, no shadow.
                  // The minimal theme deliberately doesn't use
                  // shadow - "elevation" is a marketing pattern,
                  // not a minimal one.
                  aspectRatio: '1',
                  backgroundColor: 'var(--surface-2, #f0eee8)',
                  border: '1px solid var(--border, #e8e6e0)',
                  marginBottom: '20px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {image?.url ? (
                  <img
                    src={getImageUrl(image.url)}
                    alt={image.alt ?? product.name}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.4s ease',
                    }}
                    // Subtle hover scale. CSS :hover would be
                    // better but the rest of the app uses
                    // onMouseEnter/onMouseLeave, so we match
                    // that pattern for consistency.
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.03)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: '32px',
                      color: 'var(--muted, #6b6b65)',
                      opacity: 0.4,
                    }}
                    aria-hidden="true"
                  >
                    —
                  </span>
                )}
              </div>
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 500,
                  margin: 0,
                  marginBottom: '4px',
                  fontFamily: 'var(--font)',
                }}
              >
                {product.name}
              </h3>
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--muted, #6b6b65)',
                  margin: 0,
                }}
              >
                {settings.currencySymbol}
                {product.price.toFixed(2)}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
