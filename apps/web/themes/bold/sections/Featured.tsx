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
import { DirectionArrow } from '@/components/DirectionArrow';
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function BoldFeatured({ title, subtitle, products, config }: SectionProps) {
  const { theme } = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 4;
  const list = (products ?? []).slice(0, limit);
  const perRow = Math.max(2, Math.min(6, theme.productsPerRow || 2));
  // The section row's config can point the "View all" link anywhere
  // (the admin's link text arrives with a trailing arrow glyph; we
  // strip it and render a direction-aware arrow ourselves).
  const viewAllLabel = String(config?.linkText ?? 'View all products').replace(
    /\s*[→←]\s*$/,
    ''
  );
  const viewAllHref = (config?.linkHref as string) || '/products';
  // Scale the card image on hover AND on keyboard focus, so the
  // poster treatment is not mouse-only.
  const zoomImage = (scale: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    const img = e.currentTarget.querySelector('img');
    if (img) img.style.transform = `scale(${scale})`;
  };

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      data-niche="Fashion drop"
      data-theme={theme.activeTheme}
      style={{
        // Bold's section spacing is bigger than Minimal's.
        // A 96px top padding and 128px bottom give each
        // section its own visual territory.
        padding: '96px 32px 128px',
        maxWidth: 'var(--container, 1400px)',
        margin: '0 auto',
      }}
    >
      {(title || subtitle) && (
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
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
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p
              style={{
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--muted, #a1a1aa)',
                margin: '16px 0 0',
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
              onMouseEnter={zoomImage('1.05')}
              onMouseLeave={zoomImage('1')}
              onFocus={zoomImage('1.05')}
              onBlur={zoomImage('1')}
            >
              <div
                style={{
                  // Tall 4:5 editorial crop. Bold is the
                  // "image-first / oversized photography" theme, and a
                  // portrait frame is what fashion lookbooks use - it
                  // also sets Bold apart from the square-cropped themes
                  // at a glance, which a shared 1:1 did not.
                  aspectRatio: '4 / 5',
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
                  {/* A solid fill meter rather than a star row: Bold is
                      the loud, read-it-from-across-the-room theme, and
                      blocks carry further than glyphs. aria-label above
                      still announces the real score. */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      verticalAlign: 'middle',
                      width: '56px',
                      height: '6px',
                      backgroundColor: 'var(--border, #262626)',
                      marginInlineEnd: '8px',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: `${(rating / 5) * 100}%`,
                        height: '100%',
                        backgroundColor: 'var(--accent, #facc15)',
                      }}
                    />
                  </span>
                  <span style={{ fontWeight: 800, letterSpacing: '0.04em' }}>
                    {rating.toFixed(1)}
                  </span>
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
      <div style={{ marginTop: '48px', textAlign: 'center' }}>
        <Link
          href={viewAllHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--accent, #facc15)',
            fontSize: '14px',
            fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            padding: '8px 12px',
          }}
        >
          {viewAllLabel}
          <DirectionArrow kind="forward" />
        </Link>
      </div>
    </section>
  );
}
