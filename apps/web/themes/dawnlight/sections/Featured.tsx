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
import { useTheme } from '@/lib/theme';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function DawnlightFeatured({ title, products, config }: SectionProps) {
  const theme = useTheme();
  const { settings } = useStoreSettings();
  const limit = (config?.limit as number) ?? 4;
  const list = (products ?? []).slice(0, limit);

  if (list.length === 0) return null;

  return (
    <section
      data-section="featured"
      style={{
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
        padding: '72px 24px',
      }}
    >
      {title && (
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
          <span
            aria-hidden="true"
            style={{
              flex: 1,
              height: '1px',
              backgroundColor: 'var(--border, #e6e6e6)',
            }}
          />
          <Link
            href="/products"
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--body-text, #121212)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            View all →
          </Link>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '32px 24px',
        }}
      >
        {list.map((product) => {
          const image = product.images?.[0];
          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{ display: 'block', textDecoration: 'none', color: 'var(--body-text, #121212)' }}
            >
              <div
                style={{
                  aspectRatio: '1 / 1',
                  backgroundColor: '#f7f7f7',
                  border: '1px solid var(--border, #e6e6e6)',
                  backgroundImage: image ? `url(${getImageUrl(image.url)})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div style={{ paddingTop: '16px' }}>
                <p style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>{product.name}</p>
                <p style={{ fontSize: '14px', color: 'var(--muted, #5c5c5c)', margin: '6px 0 0' }}>
                  {formatPrice(product.price, settings.currencySymbol)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
