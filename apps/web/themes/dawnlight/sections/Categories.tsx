/**
 * Dawnlight theme — Categories section.
 *
 * Dawn-style collection tiles: a flat grid with hairline borders, the
 * category image filling a 4:3 tile, the name and item count set
 * below in near-black. On hover the border darkens - no lift, no
 * shadow. Quiet and scannable, like a table of contents.
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function DawnlightCategories({ title, subtitle, categories }: SectionProps) {
  const theme = useTheme();
  const list = categories ?? [];

  if (list.length === 0) return null;

  return (
    <section
      data-section="categories"
      data-theme={theme.activeTheme}
      style={{
        backgroundColor: 'var(--body-bg, #ffffff)',
        borderTop: '1px solid var(--border, #e6e6e6)',
        borderBottom: '1px solid var(--border, #e6e6e6)',
      }}
    >
      <div style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto', padding: '72px 24px' }}>
        {(title || subtitle) && (
          <div style={{ margin: '0 0 40px', textAlign: 'center' }}>
            {title && (
              <h2
                style={{
                  fontSize: '15px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: 'var(--body-text, #121212)',
                  margin: 0,
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ fontSize: '14px', color: 'var(--muted, #5c5c5c)', margin: '8px 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '24px',
          }}
        >
          {list.map((category) => (
            <Link
              key={category.slug}
              href={`/category/${category.slug}`}
              style={{ display: 'block', textDecoration: 'none', color: 'var(--body-text, #121212)' }}
              // "On hover the border darkens" - delivered on focus
              // too so keyboard users see the same state.
              onMouseEnter={(e) => {
                const frame = e.currentTarget.querySelector('div');
                if (frame) frame.style.borderColor = 'color-mix(in srgb, var(--body-text, #121212) 55%, transparent)';
              }}
              onMouseLeave={(e) => {
                const frame = e.currentTarget.querySelector('div');
                if (frame) frame.style.borderColor = 'var(--border, #e6e6e6)';
              }}
              onFocus={(e) => {
                const frame = e.currentTarget.querySelector('div');
                if (frame) frame.style.borderColor = 'color-mix(in srgb, var(--body-text, #121212) 55%, transparent)';
              }}
              onBlur={(e) => {
                const frame = e.currentTarget.querySelector('div');
                if (frame) frame.style.borderColor = 'var(--border, #e6e6e6)';
              }}
            >
              <div
                style={{
                  aspectRatio: '4 / 3',
                  backgroundColor: 'var(--surface-2, #f7f7f7)',
                  border: '1px solid var(--border, #e6e6e6)',
                  transition: 'border-color 0.18s ease',
                  backgroundImage: category.image ? `url(${getImageUrl(category.image)})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '40px',
                }}
              >
                {!category.image ? (category.emoji || '⌂') : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: '14px' }}>
                <p style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>{category.name}</p>
                {typeof category.count === 'number' && (
                  <span style={{ fontSize: '13px', color: 'var(--muted, #5c5c5c)' }}>{category.count} items</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
