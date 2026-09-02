/**
 * Pulse theme — Categories section.
 *
 * Modern category tiles: large rounded cards, a soft indigo-tinted
 * circle holding the category emoji (or a muted image band when one
 * exists), a bold name and a quiet count. The tile system matches the
 * featured cards so the whole home page reads as one card language.
 */

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function PulseCategories({ title, subtitle, categories, config }: SectionProps) {
  const theme = useTheme();
  const list = categories ?? [];
  // The home page's category row ships a "View all" config; surface
  // it here so the category band keeps the same navigation affordance
  // as the platform default section.
  const viewAllLabel = String(config?.linkText ?? 'View all').replace(
    /\s*[→←]\s*$/,
    ''
  );
  const viewAllHref = (config?.linkHref as string) || '/products';

  if (list.length === 0) return null;

  return (
    <section
      data-section="categories"
      data-theme={theme.activeTheme}
      style={{
        backgroundColor: 'var(--body-bg, #f8fafc)',
        padding: '0 24px clamp(48px, 7vw, 88px)',
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '24px',
          }}
        >
          {list.map((category) => (
            <Link
              key={category.slug}
              href={`/category/${category.slug}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                backgroundColor: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 'var(--radius, 16px)',
                boxShadow: 'var(--shadow, 0 1px 3px rgba(15, 23, 42, 0.06))',
                overflow: 'hidden',
                color: 'var(--body-text, #0f172a)',
                transition: 'box-shadow 0.2s ease',
              }}
              // Same card language as the featured grid: the shadow
              // deepens on hover AND keyboard focus.
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
              {category.image ? (
                <div
                  style={{
                    aspectRatio: '16 / 9',
                    backgroundImage: `url(${getImageUrl(category.image)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
              ) : (
                <div style={{ padding: '28px 24px 0' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: 999,
                      // Tinted from the accent token (not hard-coded
                      // indigo-50) so accent overrides recolor it.
                      backgroundColor:
                        'color-mix(in srgb, var(--accent, #4f46e5) 12%, #ffffff)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '30px',
                    }}
                  >
                    {category.emoji || '🛍️'}
                  </div>
                </div>
              )}
              <div style={{ padding: '20px 24px 24px' }}>
                <p style={{ fontSize: '17px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
                  {category.name}
                </p>
                {typeof category.count === 'number' && (
                  <p style={{ fontSize: '14px', color: 'var(--muted, #64748b)', margin: '8px 0 0' }}>
                    {category.count} products
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
