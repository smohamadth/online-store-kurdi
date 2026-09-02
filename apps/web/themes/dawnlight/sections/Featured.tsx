/**
 * Dawnlight theme — Featured products section.
 *
 * Dawn-style grid: a quiet left-aligned section label with a hairline
 * rule above it, then a 4-up grid of flat cards — square image, hairline
 * border, no shadow, name and price set in the same near-black as the
 * body. Hover is a border darken, nothing more. The catalogue is the
 * hero; the chrome stays out of the way.
 */

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function DawnlightFeatured({ title, subtitle, products, config }: SectionProps) {
  const { theme } = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 4;
  const list = (products ?? []).slice(0, limit);
  const perRow = Math.max(2, Math.min(6, theme.productsPerRow || 4));
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
      data-theme={theme.activeTheme}
      style={{
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
        padding: '72px 24px',
      }}
    >
      {(title || subtitle) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '20px',
            borderBottom: '1px solid var(--border, #e6e6e6)',
            paddingBottom: '14px',
            marginBottom: '40px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {title && (
              <h2
                style={{
                  fontSize: '15px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: 'var(--body-text, #121212)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--muted, #5c5c5c)',
                  margin: 0,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <span
            aria-hidden="true"
            style={{
              flex: 1,
              height: '1px',
              backgroundColor: 'var(--border, #e6e6e6)',
            }}
          />
          <Link
            href={viewAllHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--body-text, #121212)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
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
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(220, Math.floor(1200 / perRow))}px), 1fr))`,
          gap: '32px 24px',
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
              style={{ display: 'block', textDecoration: 'none', color: 'var(--body-text, #121212)' }}
            >
              <div
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  backgroundColor: '#f7f7f7',
                  border: '1px solid var(--border, #e6e6e6)',
                  backgroundImage: image ? `url(${getImageUrl(image.url)})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {hasSale && (
                  <span
                    style={{
                      position: 'absolute',
                      insetInlineStart: '12px',
                      insetBlockStart: '12px',
                      backgroundColor: 'var(--sale, #b42318)',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                    }}
                  >
                    -{Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)}%
                  </span>
                )}
              </div>
              <div style={{ paddingTop: '16px' }}>
                <p style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>{product.name}</p>
                {rating > 0 && (
                  <p
                    aria-label={`Rated ${rating.toFixed(1)} out of 5`}
                    style={{ fontSize: '12px', color: 'var(--muted, #5c5c5c)', letterSpacing: '1px', margin: '4px 0 0' }}
                  >
                    <span aria-hidden="true">{'★'.repeat(Math.round(rating))}</span>
                    <span aria-hidden="true" style={{ opacity: 0.3 }}>
                      {'★'.repeat(5 - Math.round(rating))}
                    </span>{' '}
                    <span>{rating.toFixed(1)}</span>
                    {product.reviewCount ? ` (${product.reviewCount})` : ''}
                  </p>
                )}
                <p style={{ fontSize: '14px', color: 'var(--muted, #5c5c5c)', margin: '6px 0 0' }}>
                  {hasSale && (
                    <>
                      <span style={{ textDecoration: 'line-through', marginInlineEnd: '8px', opacity: 0.65 }}>
                        {formatPrice(product.compareAtPrice!, settings.currencySymbol)}
                      </span>
                      <span style={{ color: 'var(--sale, #b42318)', fontWeight: 600 }}>
                        {formatPrice(product.price, settings.currencySymbol)}
                      </span>
                    </>
                  )}
                  {!hasSale && formatPrice(product.price, settings.currencySymbol)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
