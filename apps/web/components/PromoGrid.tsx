// PromoGrid - the home page promo banner grid: takes the active
// 'promo' banners and renders up to six in a responsive grid (the
// banner rows come from /api/banners?position=promo).

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { getImageUrl } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import { looksLikeScrim, type Banner } from './HeroGallery';

export default function PromoGrid({ banners }: { banners: Banner[] }) {
  const isMobile = useIsMobile();
  if (!banners || banners.length === 0) return null;

  const visible = banners.slice(0, 6);
  const cols = Math.min(visible.length, 3);

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
                  background: 'linear-gradient(90deg, rgba(0,0,0,0.6), rgba(0,0,0,0.05))',
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
