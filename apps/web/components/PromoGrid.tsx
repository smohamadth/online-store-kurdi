// PromoGrid - the home page promo banner grid: takes the active
// 'promo' banners and renders up to six in a responsive grid (the
// banner rows come from /api/banners?position=promo).

'use client';

import { useContext } from 'react';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { I18nSeedContext } from '@/lib/i18n';
import { getImageUrl } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import { looksLikeScrim, type Banner } from './HeroGallery';

export default function PromoGrid({ banners }: { banners: Banner[] }) {
  const isMobile = useIsMobile();
  const seed = useContext(I18nSeedContext);
  const isRtl = seed?.dir === 'rtl';

  if (!banners || banners.length === 0) return null;

  const visible = banners.slice(0, 6);
  // Column count chosen so the last row is never a single orphan tile.
  // `Math.min(length, 3)` put four banners in a 3-wide grid, leaving one tile
  // stretched alone underneath three - four belongs in a 2x2.
  const cols = columnsFor(visible.length);

  return (
    <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px 0' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : `repeat(${cols}, 1fr)`,
          gap: '16px',
        }}
      >
        {visible.map((b) => {
          const inner = (
            <div
              style={{
                position: 'relative',
                height: isMobile ? '160px' : '200px',
                borderRadius: '12px',
                overflow: 'hidden',
                // No image: gradient or solid overlay colours become the
                // backdrop; a scrim-like rgba (the form default) keeps the
                // classic dark band underneath the tile's own scrim.
                background: b.image
                  ? `url(${getImageUrl(b.image)}) center/cover no-repeat`
                  : b.overlayColor && !looksLikeScrim(b.overlayColor)
                  ? b.overlayColor
                  : 'linear-gradient(120deg,#111827,#374151)',
                border: '1px solid var(--border, #e5e5e5)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  // The scrim darkens the edge the text starts from, so it
                  // has to follow the reading direction: pinned to 90deg the
                  // copy in an RTL locale sat over the transparent end and
                  // was unreadable against a light image.
                  background: isRtl
                    ? 'linear-gradient(270deg, rgba(0,0,0,0.6), rgba(0,0,0,0.05))'
                    : 'linear-gradient(90deg, rgba(0,0,0,0.6), rgba(0,0,0,0.05))',
                }}
              />
              <div
                style={{
                  position: 'relative',
                  padding: '22px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  color: b.textColor || '#fff',
                }}
              >
                {b.subtitle && (
                  <span style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>
                    {b.subtitle}
                  </span>
                )}
                <h3 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 700, marginTop: '6px' }}>{b.title}</h3>
                {b.description && (
                  <p style={{ marginTop: '6px', fontSize: '14px', opacity: 0.9, maxWidth: '260px' }}>{b.description}</p>
                )}
                {b.buttonText && (
                  <span style={{ marginTop: '14px', fontSize: '14px', fontWeight: 700 }}>{b.buttonText} <DirectionArrow kind="forward" /></span>
                )}
              </div>
            </div>
          );

          return b.linkUrl ? (
            <Link key={b.id} href={b.linkUrl} style={{ textDecoration: 'none' }}>
              {inner}
            </Link>
          ) : (
            <div key={b.id}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Columns for a given tile count, avoiding a lone tile on the last row.
 *
 *   1 -> 1      4 -> 2 (2x2)
 *   2 -> 2      5 -> 3 (3+2)
 *   3 -> 3      6 -> 3 (3+3)
 */
function columnsFor(n: number): number {
  if (n <= 1) return 1;
  if (n === 2 || n === 4) return 2;
  return 3;
}
