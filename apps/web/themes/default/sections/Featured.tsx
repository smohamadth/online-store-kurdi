/**
 * Default theme — Featured products.
 *
 * Conversion-first 4-up cards: soft shadow, sale badge, rating, price,
 * and a brand-coloured “Shop” CTA. This is what mixed-catalogue shops
 * get when they keep the platform default instead of a niche template.
 */

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function DefaultFeatured({ title, subtitle, products, config }: SectionProps) {
  const { theme } = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 8;
  const list = (products ?? []).slice(0, limit);
  const perRow = Math.max(2, Math.min(6, theme?.productsPerRow || 4));
  const viewAllLabel = String(config?.linkText ?? 'View all products').replace(/\s*[→←]\s*$/, '');
  const viewAllHref = (config?.linkHref as string) || '/products';

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      data-theme={theme.activeTheme}
      style={{
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
        padding: '64px 24px',
      }}
    >
      {(title || subtitle) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div>
            {title && (
              <h2
                style={{
                  fontSize: 'clamp(22px, 3vw, 28px)',
                  fontWeight: 'var(--heading-weight, 800)',
                  margin: 0,
                  color: 'var(--body-text)',
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ fontSize: '15px', color: 'var(--muted)', margin: '8px 0 0' }}>{subtitle}</p>
            )}
          </div>
          <Link
            href={viewAllHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--accent)',
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
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(200, Math.floor(1200 / perRow))}px), 1fr))`,
          gap: '20px',
        }}
      >
        {list.map((product) => {
          const image = product.images?.[0];
          const rating = Number(product.averageRating) || 0;
          const hasSale =
            typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
          const discount = hasSale
            ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
            : 0;
          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                textDecoration: 'none',
                color: 'var(--body-text)',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius, 8px)',
                boxShadow: 'var(--shadow)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  backgroundColor: 'var(--surface-2, #f3f4f6)',
                  backgroundImage: image ? `url(${getImageUrl(image.url)})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {hasSale && discount >= 1 && (
                  <span
                    style={{
                      position: 'absolute',
                      insetInlineStart: '10px',
                      insetBlockStart: '10px',
                      backgroundColor: 'var(--sale)',
                      // token-ratchet-ok: on the --sale badge fill.
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '4px 8px',
                      borderRadius: 'var(--radius, 8px)',
                    }}
                  >
                    -{discount}%
                  </span>
                )}
              </div>
              <div style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{product.name}</h3>
                {rating > 0 && (
                  <p
                    aria-label={`Rated ${rating.toFixed(1)} out of 5`}
                    style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}
                  >
                    <span aria-hidden="true">{'★'.repeat(Math.round(rating))}</span>
                    <span aria-hidden="true" style={{ opacity: 0.3 }}>
                      {'★'.repeat(5 - Math.round(rating))}
                    </span>{' '}
                    {rating.toFixed(1)}
                    {product.reviewCount ? ` (${product.reviewCount})` : ''}
                  </p>
                )}
                <p style={{ fontSize: '16px', fontWeight: 800, color: 'var(--price)', margin: '4px 0 0' }}>
                  {hasSale && (
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        textDecoration: 'line-through',
                        marginInlineEnd: '8px',
                        color: 'var(--muted)',
                      }}
                    >
                      {formatPrice(product.compareAtPrice!, settings.currencySymbol)}
                    </span>
                  )}
                  {formatPrice(product.price, settings.currencySymbol)}
                </p>
                <span
                  style={{
                    marginTop: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    minHeight: '36px',
                    padding: '8px 12px',
                    backgroundColor: 'var(--brand)',
                    color: 'var(--brand-text)',
                    borderRadius: 'var(--btn-radius, 8px)',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                >
                  Shop <DirectionArrow kind="forward" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
