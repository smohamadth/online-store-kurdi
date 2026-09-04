/**
 * Default theme — Categories.
 *
 * Compact 4-up tiles with emoji (or image), name, and count. Everyday
 * retail: scannable, colourful, not a lookbook and not a text list.
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function DefaultCategories({ title, subtitle, categories, config }: SectionProps) {
  const theme = useTheme();
  const limit = (config?.limit as number) ?? 8;
  const list = (categories ?? []).slice(0, limit);

  if (list.length === 0) return null;

  return (
    <section
      data-section="categories"
      data-niche="General retail"
      data-theme={theme.activeTheme}
      style={{
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
        padding: '24px 24px 56px',
      }}
    >
      {(title || subtitle) && (
        <div style={{ marginBottom: '24px' }}>
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
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '16px',
        }}
      >
        {list.map((cat) => (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              padding: '18px 12px',
              textDecoration: 'none',
              color: 'var(--body-text)',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius, 8px)',
              boxShadow: 'var(--shadow)',
            }}
          >
            {cat.image ? (
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: 'var(--radius, 8px)',
                  backgroundImage: `url(${getImageUrl(cat.image)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            ) : (
              <span style={{ fontSize: '32px', lineHeight: 1 }} aria-hidden="true">
                {cat.emoji || '🛍️'}
              </span>
            )}
            <span style={{ fontSize: '14px', fontWeight: 700 }}>{cat.name}</span>
            {typeof cat.count === 'number' && (
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {cat.count} {cat.count === 1 ? 'product' : 'products'}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
