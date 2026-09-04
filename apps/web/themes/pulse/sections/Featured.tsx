/**
 * Pulse theme — Featured products section.
 *
 * Medusa-starter-style product cards: white cards on the off-white
 * canvas, 16px corner radius, a soft shadow that deepens on hover, a
 * square media tile, the name in semibold sans and the price bold.
 * Three-up on desktop (the modern storefront's denser, larger-card
 * rhythm), reflowing to 2 then 1 on smaller screens.
 */

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function PulseFeatured({ title, subtitle, products, config }: SectionProps) {
  const { theme } = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 6;
  const list = (products ?? []).slice(0, limit);
  // Honor the theme's desktop columns-per-row token (falling back to a sane
  // default when the admin has not set it), while letting auto-fit reflow to
  // fewer columns on small screens.
  const perRow = Math.max(2, Math.min(6, theme.productsPerRow || 3));
  // The admin's link text arrives with a trailing arrow glyph; we
  // strip it and render a direction-aware arrow so RTL mirrors.
  const viewAllLabel = String(config?.linkText ?? 'View all').replace(
    /\s*[→←]\s*$/,
    ''
  );
  const viewAllHref = (config?.linkHref as string) || '/products';

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      data-niche="DTC & apps"
      data-theme={theme.activeTheme}
      style={{
        backgroundColor: 'var(--body-bg, #f8fafc)',
        padding: 'clamp(48px, 7vw, 88px) 24px',
      }}
    >
      <div style={{ maxWidth: 'var(--container, 1280px)', margin: '0 auto' }}>
        {(title || subtitle) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '16px',
              marginBottom: '40px',
            }}
          >
            <div style={{ maxWidth: '560px' }}>
              {title && (
                <h2
                  style={{
                    fontSize: 'clamp(24px, 3.5vw, 34px)',
                    letterSpacing: '-0.01em',
                    fontWeight: 'var(--heading-weight, 700)',
                    color: 'var(--body-text, #0f172a)',
                    margin: 0,
                  }}
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p style={{ fontSize: '16px', lineHeight: 1.6, color: 'var(--muted, #64748b)', margin: '12px 0 0' }}>
                  {subtitle}
                </p>
              )}
            </div>
            <Link
              href={viewAllHref}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--accent, #4f46e5)',
                textDecoration: 'none',
                paddingBottom: '4px',
              }}
            >
              {viewAllLabel}
              <DirectionArrow kind="forward" />
            </Link>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            // auto-fit keeps the grid responsive on phones/tablets, while the
            // minmax floor derived from productsPerRow makes desktop land on
            // the theme's declared columns-per-row.
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(240, Math.floor(1200 / perRow))}px), 1fr))`,
            gap: '24px',
          }}
        >
        {list.map((product) => {
          const image = product.images?.[0];
          const rating = Number(product.averageRating) || 0;
          const hasSale =
            typeof product.compareAtPrice === 'number' &&
            product.compareAtPrice > product.price;
          // Only badge a real saving - a 1-cent gap would otherwise
          // round to a "-0%" sticker.
          const discount = hasSale
            ? Math.round(
                ((product.compareAtPrice! - product.price) /
                  product.compareAtPrice!) *
                  100
              )
            : 0;
          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                backgroundColor: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 'var(--radius, 16px)',
                boxShadow: 'var(--shadow, 0 1px 3px rgba(15, 23, 42, 0.06))',
                color: 'var(--body-text, #0f172a)',
                overflow: 'hidden',
                transition: 'box-shadow 0.2s ease',
              }}
              // The card's promised behaviour: the soft shadow
              // deepens on hover - and on keyboard focus, so the
              // affordance is not mouse-only.
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                  'var(--shadow-hover, 0 16px 32px rgba(15, 23, 42, 0.14))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'var(--shadow, 0 1px 3px rgba(15, 23, 42, 0.06))';
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow =
                  'var(--shadow-hover, 0 16px 32px rgba(15, 23, 42, 0.14))';
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'var(--shadow, 0 1px 3px rgba(15, 23, 42, 0.06))';
              }}
            >
              <div
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  backgroundColor: 'var(--surface-2, #f1f5f9)',
                  backgroundImage: image ? `url(${getImageUrl(image.url)})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {hasSale && discount >= 1 && (
                  <span
                    style={{
                      position: 'absolute',
                      insetInlineStart: '12px',
                      insetBlockStart: '12px',
                      backgroundColor: 'var(--sale, #dc2626)',
                      // token-ratchet-ok: on the --sale badge fill.
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 999,
                    }}
                  >
                    -{discount}%
                  </span>
                )}
              </div>
                <div style={{ padding: '18px 20px 20px' }}>
                  <p style={{ fontSize: '16px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
                    {product.name}
                  </p>
                  {rating > 0 && (
                    <p
                      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
                      style={{
                        fontSize: '13px',
                        color: 'var(--muted, #64748b)',
                        margin: '6px 0 0',
                        letterSpacing: '1px',
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
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '10px', gap: '8px' }}>
                    <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--price, #0f172a)', margin: 0 }}>
                      {formatPrice(product.price, settings.currencySymbol)}
                    </p>
                    {hasSale && (
                      <span style={{ fontSize: '14px', color: 'var(--muted, #94a3b8)', textDecoration: 'line-through' }}>
                        {formatPrice(product.compareAtPrice!, settings.currencySymbol)}
                      </span>
                    )}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--accent, #4f46e5)',
                        marginInlineStart: 'auto',
                      }}
                    >
                      View <DirectionArrow kind="forward" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
