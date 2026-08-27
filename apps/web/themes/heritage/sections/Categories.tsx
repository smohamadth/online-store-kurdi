/**
 * Heritage theme — Categories section.
 *
 * A centred, rule-capped grid of department tiles: hairline-bordered
 * squares, a centred serif department name and the item count beneath
 * in muted small caps. No images by default - the established-catalogue
 * look is typographic. If a category has an image it is shown as a
 * muted 4:3 band above the name.
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function HeritageCategories({ title, categories }: SectionProps) {
  const theme = useTheme();
  const list = categories ?? [];

  if (list.length === 0) return null;

  return (
    <section
      data-section="categories"
      style={{
        backgroundColor: '#fbfbfc',
        borderTop: '1px solid var(--border, #d9dee3)',
        borderBottom: '1px solid var(--border, #d9dee3)',
        padding: '64px 24px',
      }}
    >
      <div style={{ maxWidth: 'var(--container, 1160px)', margin: '0 auto' }}>
        {title && (
          <h2
            style={{
              fontFamily: 'var(--font, Georgia, serif)',
              fontSize: '15px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--muted, #5f6b7a)',
              textAlign: 'center',
              margin: '0 0 40px',
              fontWeight: 600,
            }}
          >
            {title}
          </h2>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
                color: 'var(--body-text, #212529)',
                border: '1px solid var(--border, #d9dee3)',
                backgroundColor: 'var(--card-bg, #ffffff)',
                padding: category.image ? '0 0 20px' : '28px 20px',
                textAlign: 'center',
              }}
            >
              {category.image && (
                <div
                  style={{
                    aspectRatio: '4 / 3',
                    backgroundImage: `url(${getImageUrl(category.image)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    margin: '0 -20px 18px',
                  }}
                />
              )}
              <p
                style={{
                  fontFamily: 'var(--font, Georgia, serif)',
                  fontSize: '17px',
                  fontWeight: 600,
                  margin: category.image ? 0 : '0 0 8px',
                }}
              >
                {category.name}
              </p>
              {typeof category.count === 'number' && (
                <p
                  style={{
                    fontSize: '12px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--muted, #5f6b7a)',
                    margin: 0,
                  }}
                >
                  {category.count} items
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
