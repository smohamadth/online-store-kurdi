/**
 * Heritage theme — Featured products section.
 *
 * Storefront-style product grid: a centred serif section title over a
 * short gold rule, then a 4-up grid of plain cards with a hairline
 * border, the product image square, the name in serif and the price in
 * classic blue. "On sale" is a small brick-red label, the way
 * established catalogues have marked reduced goods.
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function HeritageFeatured({ title, products, config }: SectionProps) {
  const theme = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 4;
  const list = (products ?? []).slice(0, limit);

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      style={{
        backgroundColor: 'var(--body-bg, #ffffff)',
        padding: '72px 24px',
      }}
    >
      <div style={{ maxWidth: 'var(--container, 1160px)', margin: '0 auto' }}>
        {title && (
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2
              style={{
                fontFamily: 'var(--font, Georgia, serif)',
                fontSize: 'clamp(22px, 3vw, 30px)',
                fontWeight: 'var(--heading-weight, 700)',
                color: 'var(--body-text, #212529)',
                margin: 0,
              }}
            >
              {title}
            </h2>
            <div
              style={{
                width: '56px',
                height: '2px',
                backgroundColor: 'var(--accent, #a13d2d)',
                margin: '14px auto 0',
              }}
            />
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '40px 28px',
          }}
        >
          {list.map((product) => {
            const image = product.images?.[0];
            return (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                style={{ display: 'block', textDecoration: 'none', color: 'var(--body-text, #212529)' }}
              >
                <div
                  style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    backgroundColor: '#f6f7f8',
                    border: '1px solid var(--border, #d9dee3)',
                    backgroundImage: image ? `url(${getImageUrl(image.url)})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div style={{ paddingTop: '16px', textAlign: 'center' }}>
                  <p
                    style={{
                      fontFamily: 'var(--font, Georgia, serif)',
                      fontSize: '16px',
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {product.name}
                  </p>
                  <p
                    style={{
                      fontSize: '15px',
                      color: 'var(--price, #1f4e8c)',
                      margin: '8px 0 0',
                      fontWeight: 600,
                    }}
                  >
                    {formatPrice(product.price, settings.currencySymbol)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
