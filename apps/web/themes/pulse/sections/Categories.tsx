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
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function PulseCategories({ title, subtitle, categories }: SectionProps) {
  const theme = useTheme();
  const list = categories ?? [];

  if (list.length === 0) return null;

  return (
    <section
      data-section="categories"
      style={{
        backgroundColor: 'var(--body-bg, #f8fafc)',
        padding: '0 24px clamp(48px, 7vw, 88px)',
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
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                overflow: 'hidden',
                color: 'var(--body-text, #0f172a)',
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
                      backgroundColor: '#eef2ff',
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
