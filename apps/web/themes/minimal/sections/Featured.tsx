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
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function MinimalFeatured({ title, subtitle, products, config }: SectionProps) {
  const { theme } = useTheme();
  const { settings } = useStoreSettings();
  // Default to 4 products if the admin didn't pick a count.
  const limit = (config?.limit as number) ?? 4;
  const list = (products ?? []).slice(0, limit);
  // The minimal theme declares its own desktop columns-per-row; honor it while
  // letting the grid reflow to fewer columns on phones/tablets.
  const perRow = Math.max(2, Math.min(6, theme.productsPerRow || 3));

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      data-theme={theme.activeTheme}
      style={{
        // Generous padding - the minimal theme's signature is
        // "more whitespace than you think is reasonable."
        padding: '96px 24px',
        maxWidth: 'var(--container, 960px)',
        margin: '0 auto',
      }}
    >
      {(title || subtitle) && (
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          {title && (
            <h2
              style={{
                fontSize: '13px',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--muted, #6b6b65)',
                fontWeight: 500,
                margin: 0,
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p
              style={{
                fontSize: '14px',
                color: 'var(--muted, #6b6b65)',
                fontWeight: 500,
                margin: '10px 0 0',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(200, Math.floor(960 / perRow))}px), 1fr))`,
          gap: '48px 32px',
        }}
      >
        {list.map((product) => {
          const image = product.images?.[0];
          const rating = Number(product.averageRating) || 0;
          const hasSale =
            typeof product.compareAtPrice === 'number' &&
            product.compareAtPrice > product.price;
          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'var(--body-text, #1a1a1a)',
              }}
              // Keyboard focus scales the image just like hover,
              // so the zoom is not mouse-only.
              onMouseEnter={(e) => {
                const img = e.currentTarget.querySelector('img');
                if (img) img.style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                const img = e.currentTarget.querySelector('img');
                if (img) img.style.transform = 'scale(1)';
              }}
              onFocus={(e) => {
                const img = e.currentTarget.querySelector('img');
                if (img) img.style.transform = 'scale(1.03)';
              }}
              onBlur={(e) => {
                const img = e.currentTarget.querySelector('img');
                if (img) img.style.transform = 'scale(1)';
              }}
            >
              <div
                style={{
                  // Wide 4:3 crop, subtle border, no shadow. Minimal is
                  // text-first: a shorter frame keeps the image
                  // supporting rather than dominant, and leaves the
                  // serif name and price as the loudest thing on the
                  // card. Also distinguishes it from the square themes.
                  // "Elevation" stays off - it is a marketing pattern,
                  // not a minimal one.
                  aspectRatio: '4 / 3',
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
              {rating > 0 && (
                <p
                  aria-label={`Rated ${rating.toFixed(1)} out of 5`}
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted, #6b6b65)',
                    letterSpacing: '1px',
                    margin: '0 0 6px',
                  }}
                >
                  {/* Typographic rating, no star row. Minimal ships
                      "no marketing chrome", and a five-star glyph strip
                      is precisely that; the score reads as editorial
                      credit instead. Screen readers still get the full
                      "Rated x out of 5" from aria-label above. */}
                  <span>{rating.toFixed(1)}</span>
                  <span aria-hidden="true" style={{ opacity: 0.5 }}> / 5</span>
                  {product.reviewCount ? ` (${product.reviewCount})` : ''}
                </p>
              )}
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--muted, #6b6b65)',
                  margin: 0,
                }}
              >
                {hasSale && (
                  <>
                    <span style={{ textDecoration: 'line-through', marginInlineEnd: '8px', opacity: 0.7 }}>
                      {formatPrice(product.compareAtPrice!, settings.currencySymbol)}
                    </span>
                    <span style={{ color: 'var(--sale, #8b3a3a)', fontWeight: 600 }}>
                      {formatPrice(product.price, settings.currencySymbol)}
                    </span>
                  </>
                )}
                {!hasSale && formatPrice(product.price, settings.currencySymbol)}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
