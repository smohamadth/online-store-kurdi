/**
 * Bold theme — Featured products section.
 *
 * A 2-column grid of oversized product cards. Each card is
 * essentially a poster: full-bleed image, minimal chrome,
 * the product name and price as the only labels.
 *
 * Bold's product card is the opposite of the default's:
 * the default card has hover, badges, and a call to action;
 * Bold's card is a static image with the product name and
 * price below it. The decision is "we let the product image
 * do the work."
 *
 * Why no "Add to cart" button? The card links to the
 * product detail page. The detail page is where the buy
 * action lives. This is a 2014-era Instagram-style design
 * choice; for a fashion store, it's the right pattern
 * because the merchant usually has a small catalogue where
 * every product matters.
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function BoldFeatured({ title, products, config }: SectionProps) {
  const { theme } = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 4;
  const list = (products ?? []).slice(0, limit);
  const perRow = Math.max(2, Math.min(6, theme.productsPerRow || 2));

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      style={{
        // Bold's section spacing is bigger than Minimal's.
        // A 96px top padding and 128px bottom give each
        // section its own visual territory.
        padding: '96px 32px 128px',
        maxWidth: 'var(--container, 1400px)',
        margin: '0 auto',
      }}
    >
      {title && (
        <h2
          style={{
            // The section title is large and uppercase.
            // Different from Minimal's 13px tag, Bold's title
            // IS the section.
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: 'var(--body-text, #fafafa)',
            margin: 0,
            marginBottom: '64px',
            textAlign: 'center',
          }}
        >
          {title}
        </h2>
      )}
      <div
        style={{
          display: 'grid',
          // Honor the theme's desktop columns-per-row (Bold ships 2) while
          // letting auto-fit reflow to a single column on phones/tablets.
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(340, Math.floor(1400 / perRow))}px), 1fr))`,
          gap: '32px',
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
                color: 'var(--body-text, #fafafa)',
              }}
            >
              <div
                style={{
                  // Square image, full bleed. The image is
                  // the product. Padding-bottom trick to keep
                  // 1:1 aspect ratio without the new
                  // `aspectRatio` CSS (which the rest of the
                  // codebase uses, but for the Bold card the
                  // padding trick matches the default
                  // ProductCard's pattern).
                  aspectRatio: '1',
                  backgroundColor: 'var(--card-bg, #171717)',
                  overflow: 'hidden',
                  marginBottom: '24px',
                  border: '1px solid var(--border, #262626)',
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
                      transition: 'transform 0.5s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: '64px',
                      color: 'var(--muted, #a1a1aa)',
                      opacity: 0.3,
                    }}
                    aria-hidden="true"
                  >
                    —
                  </span>
                )}
              </div>
              <h3
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  margin: 0,
                  marginBottom: '8px',
                  color: 'var(--body-text, #fafafa)',
                }}
              >
                {product.name}
              </h3>
              {rating > 0 && (
                <p
                  aria-label={`Rated ${rating.toFixed(1)} out of 5`}
                  style={{
                    fontSize: '13px',
                    color: 'var(--muted, #a1a1aa)',
                    letterSpacing: '2px',
                    margin: '0 0 6px',
                  }}
                >
                  <span aria-hidden="true">{'★'.repeat(Math.round(rating))}</span>
                  <span aria-hidden="true" style={{ opacity: 0.3 }}>
                    {'★'.repeat(5 - Math.round(rating))}
                  </span>{' '}
                  <span>{rating.toFixed(1)}</span>
                  {product.reviewCount ? ` (${product.reviewCount})` : ''}
                </p>
              )}
              <p
                style={{
                  // The price is the focal point of the meta
                  // line. Bold uses the accent colour (yellow)
                  // for prices, which is the loudest colour
                  // choice in the system.
                  fontSize: '20px',
                  fontWeight: 800,
                  margin: 0,
                  color: 'var(--price, #facc15)',
                }}
              >
                {hasSale && (
                  <span style={{ fontSize: '15px', textDecoration: 'line-through', marginInlineEnd: '10px', opacity: 0.6 }}>
                    {formatPrice(product.compareAtPrice!, settings.currencySymbol)}
                  </span>
                )}
                {formatPrice(product.price, settings.currencySymbol)}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
