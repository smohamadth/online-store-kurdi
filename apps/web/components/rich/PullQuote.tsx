// Pull quote — a rich prebuilt home block (type "quote").
//
// A centred statement band with attribution. The background choice maps
// onto the store theme: none (page background), soft (--surface-2),
// brand (--brand with --brand-text), or dark (near-black with white
// text) — the same vocabulary the Custom section uses.

'use client';

import type { CSSProperties } from 'react';

interface Props {
  quote?: string;
  author?: string;
  role?: string;
  avatar?: string;
  background?: 'none' | 'soft' | 'brand' | 'dark';
}

export default function PullQuote({
  quote,
  author,
  role,
  avatar,
  background = 'soft',
}: Props) {
  if (!quote) return null;

  const bgMap: Record<NonNullable<Props['background']>, CSSProperties> = {
    none: { backgroundColor: 'transparent' },
    soft: { backgroundColor: 'var(--surface-2, #f4f4f5)' },
    brand: { backgroundColor: 'var(--brand, #111111)', color: 'var(--brand-text, #ffffff)' },
    dark: { backgroundColor: '#111827', color: '#f9fafb' },
  };
  const onBrand = background === 'brand' || background === 'dark';
  const band = bgMap[background] ?? bgMap.soft;

  return (
    <section
      data-section="quote"
      data-background={background}
      style={{ backgroundColor: band.backgroundColor, color: band.color }}
    >
      <div
        style={{
          maxWidth: 'var(--container, 1200px)',
          margin: '0 auto',
          padding: '72px 20px',
        }}
      >
        <div style={{ maxWidth: '880px', margin: '0 auto', textAlign: 'center' }}>
          <div
            aria-hidden="true"
            style={{
              fontSize: '54px',
              lineHeight: '0.6',
              fontWeight: 900,
              color: onBrand ? band.color : 'var(--accent, #2563eb)',
              opacity: onBrand ? 0.55 : 0.9,
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            “
          </div>
          <blockquote
            style={{
              margin: '22px 0 0',
              fontSize: 'clamp(21px, 3.2vw, 32px)',
              lineHeight: 1.5,
              fontWeight: 'var(--heading-weight, 800)',
              letterSpacing: '-0.01em',
              color: 'inherit',
            }}
          >
            {quote}
          </blockquote>
          {(author || role) && (
            <div
              style={{
                marginTop: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              {avatar && (
                <img
                  src={avatar}
                  alt={author || 'portrait'}
                  loading="lazy"
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              )}
              <div style={{ textAlign: 'start' }}>
                {author && (
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'inherit' }}>{author}</div>
                )}
                {role && (
                  <div
                    style={{
                      fontSize: '13px',
                      color: onBrand ? 'inherit' : 'var(--muted, #6b7280)',
                      opacity: onBrand ? 0.75 : 1,
                    }}
                  >
                    {role}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
