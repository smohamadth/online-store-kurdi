/**
 * Minimal theme — Categories section.
 *
 * Categories as a vertical list of links, not a tile grid. The
 * name of the category, the product count, and a thin underline.
 * Click to browse.
 *
 * This is the most opinionated section in the minimal theme. The
 * argument: a category tile with an emoji is decoration. A list
 * of category names is information. The minimal theme prefers
 * information.
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import type { SectionProps } from '@/lib/themeSections';

export default function MinimalCategories({ title, subtitle, categories, config }: SectionProps) {
  const theme = useTheme();
  const limit = (config?.limit as number) ?? 6;
  const list = (categories ?? []).slice(0, limit);

  if (list.length === 0) return null;

  return (
    <section
      data-section="categories"
      style={{
        padding: '64px 24px 96px',
        maxWidth: 'var(--container, 960px)',
        margin: '0 auto',
        // A top border separates this section from whatever
        // came before. The minimal theme's section dividers
        // are 1px lines, not background-color changes.
        borderTop: '1px solid var(--border, #e8e6e0)',
      }}
    >
      {(title || subtitle) && (
        <div style={{ marginBottom: '32px' }}>
          {title && (
            <h2
              style={{
                fontSize: '13px',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--muted, #6b6b65)',
                fontWeight: 500,
                margin: 0,
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p
              style={{
                fontSize: '14px',
                color: 'var(--muted, #6b6b65)',
                margin: '8px 0 0',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {list.map((cat, i) => (
          <li
            key={cat.slug}
            style={{
              borderBottom:
                i === list.length - 1
                  ? 'none'
                  : '1px solid var(--border, #e8e6e0)',
            }}
          >
            <Link
              href={`/category/${cat.slug}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '20px 0',
                textDecoration: 'none',
                color: 'var(--body-text, #1a1a1a)',
                fontFamily: 'var(--font)',
                transition: 'color 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent, #8b6f47)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--body-text, #1a1a1a)';
              }}
              // Keyboard users get the same hover colour on focus.
              onFocus={(e) => {
                e.currentTarget.style.color = 'var(--accent, #8b6f47)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.color = 'var(--body-text, #1a1a1a)';
              }}
            >
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 500,
                }}
              >
                {cat.name}
              </span>
              <span
                style={{
                  fontSize: '14px',
                  color: 'var(--muted, #6b6b65)',
                }}
              >
                {cat.count ?? 0} {cat.count === 1 ? 'product' : 'products'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
