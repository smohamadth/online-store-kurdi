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
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function PulseFeatured({ title, subtitle, products, config }: SectionProps) {
  const theme = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 6;
  const list = (products ?? []).slice(0, limit);

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      style={{
        backgroundColor: 'var(--body-bg, #f8fafc)',
        padding: 'clamp(48px, 7vw, 88px) 24px',
      }}
    >
      <div style={{ maxWidth: 'var(--container, 1280px)', margin: '0 auto' }}>
        {(title || subtitle) && (
          <div style={{ marginBottom: '40px', maxWidth: '560px' }}>
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
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
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
                  backgroundColor: 'var(--card-bg, #ffffff)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 'var(--radius, 16px)',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                  color: 'var(--body-text, #0f172a)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    aspectRatio: '1 / 1',
                    backgroundColor: '#f1f5f9',
                    backgroundImage: image ? `url(${getImageUrl(image.url)})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div style={{ padding: '18px 20px 20px' }}>
                  <p style={{ fontSize: '16px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
                    {product.name}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '10px' }}>
                    <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--price, #0f172a)', margin: 0 }}>
                      {formatPrice(product.price, settings.currencySymbol)}
                    </p>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--accent, #4f46e5)',
                      }}
                    >
                      View →
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
