/**
 * Heritage theme — Hero section.
 *
 * Original implementation in the spirit of WooCommerce Storefront
 * (the most-installed WordPress store theme): a centred, classic
 * banner — small-caps eyebrow, serif headline, one line of subtext,
 * a solid classic-blue CTA — capped by a thin double rule. Below it,
 * the categories as a centred text strip with hairline separators,
 * the way established catalogues have presented departments for
 * decades.
 *
 * (Design inspiration only: Storefront is GPL-3.0 and this is a
 * from-scratch re-interpretation, not a copy of its code.)
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import type { SectionProps } from '@/lib/themeSections';

export default function HeritageHero({ banners, categories }: SectionProps) {
  const theme = useTheme();
  const first = banners?.[0];

  return (
    <section data-section="hero" data-theme={theme.activeTheme}>
      <div
        style={{
          backgroundColor: 'var(--body-bg, #ffffff)',
          textAlign: 'center',
          padding: 'clamp(56px, 8vw, 96px) 24px 0',
        }}
      >
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          {first?.badge && (
            <span
              style={{
                display: 'inline-block',
                fontSize: '12px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--muted, #5f6b7a)',
                marginBottom: '18px',
              }}
            >
              {first.badge}
            </span>
          )}
          <h1
            style={{
              fontFamily: 'var(--font, Georgia, serif)',
              fontSize: 'clamp(30px, 5vw, 48px)',
              lineHeight: 1.15,
              fontWeight: 'var(--heading-weight, 700)',
              color: 'var(--body-text, #212529)',
              margin: 0,
            }}
          >
            {first?.title || 'A catalogue worth keeping'}
          </h1>
          {(first?.subtitle || first?.description) && (
            <p
              style={{
                fontFamily: 'var(--font, Georgia, serif)',
                fontSize: '17px',
                lineHeight: 1.6,
                color: 'var(--muted, #5f6b7a)',
                margin: '18px auto 0',
                maxWidth: '520px',
              }}
            >
              {first.subtitle || first.description}
            </p>
          )}
          <Link
            href={first?.linkUrl || '/products'}
            style={{
              display: 'inline-block',
              marginTop: '32px',
              padding: '14px 36px',
              backgroundColor: 'var(--primary, #1f4e8c)',
              color: 'var(--primary-text, #ffffff)',
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              border: '1px solid var(--primary, #1f4e8c)',
            }}
          >
            {first?.buttonText || 'Browse the catalogue'}
          </Link>
        </div>

        {/* The classic double rule. */}
        <div style={{ maxWidth: 'var(--container, 1160px)', margin: '48px auto 0', padding: '0 24px' }}>
          <div style={{ borderTop: '2px solid var(--body-text, #212529)', marginBottom: '3px' }} />
          <div style={{ borderTop: '1px solid var(--body-text, #212529)' }} />
        </div>

        {/* Department strip: centred text links with hairline separators. */}
        {(categories ?? []).length > 0 && (
          <nav
            aria-label="Departments"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '8px 0',
              paddingTop: '20px',
              paddingBottom: '8px',
            }}
          >
            {(categories ?? []).map((category, i) => (
              <span key={category.slug} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: '1px',
                      height: '16px',
                      backgroundColor: 'var(--border, #d9dee3)',
                      margin: '0 16px',
                    }}
                  />
                )}
                <Link
                  href={`/category/${category.slug}`}
                  style={{
                    fontFamily: 'var(--font, Georgia, serif)',
                    fontSize: '14px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--body-text, #212529)',
                    textDecoration: 'none',
                    padding: '8px 0',
                  }}
                >
                  {category.name}
                </Link>
              </span>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
