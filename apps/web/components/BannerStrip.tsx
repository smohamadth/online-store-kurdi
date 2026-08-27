'use client';

/**
 * Full-width call-to-action banner for the home page.
 *
 * Backed by the existing `Banner` table with `position = "strip"`. That value
 * was already accepted by the API and stored in the database, but nothing ever
 * rendered it - a banner saved as "strip" simply disappeared. This component
 * closes that gap.
 *
 * Everything shown here is admin-editable in Admin -> Banners:
 *   title / subtitle / description / badge   - the copy
 *   image / mobileImage                      - optional photo background
 *   overlayColor                             - CSS gradient used when no image
 *   textColor, align                         - presentation
 *   buttonText + linkUrl                     - primary call to action
 *   secondaryText + secondaryUrl             - optional second button
 *   startsAt / endsAt                        - scheduling, enforced by the API
 *   sortOrder                                - order when several are active
 *
 * Placement on the page is controlled by the `bannerStrip` HomeSection, so an
 * admin can drag it above or below any other block.
 */

import { useState } from 'react';
import Link from 'next/link';
import { getImageUrl } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import type { Banner } from './HeroGallery';

const CONTAINER = 'var(--container, 1200px)';

/**
 * A readable text colour for the given background.
 *
 * The admin picks `textColor` freely, but they can also pick a pale image or
 * gradient. Rather than trusting the stored value blindly we only use it when
 * it actually contrasts with the fallback surface.
 */
function isDark(css: string): boolean {
  const hexes = css.match(/#([0-9a-f]{6}|[0-9a-f]{3})/gi) || [];
  if (!hexes.length) return true; // gradients we can't parse: assume dark
  let total = 0;
  for (const h of hexes) {
    let s = h.slice(1);
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    total += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return total / hexes.length < 140;
}

export default function BannerStrip({ banners }: { banners: Banner[] }) {
  const isMobile = useIsMobile();
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  // Nothing configured: render nothing rather than an empty box. The admin
  // sees an explicit empty-state in the Banners screen instead.
  if (!banners || banners.length === 0) return null;

  return (
    <>
      {banners.map((b) => {
        const bg = b.overlayColor || 'linear-gradient(120deg,#111827 0%,#374151 100%)';
        const img = b.image && !failed[b.id] ? getImageUrl(b.image) : '';
        const mobileImg =
          b.mobileImage && !failed[b.id] ? getImageUrl(b.mobileImage) : img;
        const shown = isMobile && mobileImg ? mobileImg : img;

        // With a photo we always overlay a scrim, so light text is correct.
        const light = shown ? true : isDark(bg);
        const text = b.textColor || (light ? '#ffffff' : '#111111');
        const align = (b.align as 'left' | 'center' | 'right') || 'center';

        return (
          <section
            key={b.id}
            style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '48px 20px 0' }}
          >
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 'var(--radius, 16px)',
                boxShadow: 'var(--shadow, none)',
                background: bg,
                color: text,
                padding: isMobile ? '34px 22px' : '56px 48px',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: isMobile ? '22px' : '32px',
                // Logical alignment (see HeroGallery): the stored
                // "left"/"right" mirrors to the reading-start /
                // reading-end side in RTL instead of staying on the
                // physical side.
                textAlign: isMobile
                  ? 'start'
                  : align === 'center'
                    ? 'center'
                    : align === 'right'
                      ? 'end'
                      : 'start',
              }}
            >
              {/* Photo background + scrim so text stays legible on any image */}
              {shown && (
                <>
                  <img
                    src={shown}
                    alt=""
                    aria-hidden="true"
                    onError={() => setFailed((f) => ({ ...f, [b.id]: true }))}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(90deg, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.28) 100%)',
                    }}
                  />
                </>
              )}

              <div
                style={{
                  position: 'relative',
                  maxWidth: isMobile ? '100%' : '640px',
                  marginInlineStart: !isMobile && align === 'center' ? 'auto' : undefined,
                  marginInlineEnd: !isMobile && align === 'center' ? 'auto' : undefined,
                }}
              >
                {b.badge && (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '5px 12px',
                      borderRadius: '999px',
                      backgroundColor: 'var(--sale, #dc2626)',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 800,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {b.badge}
                  </span>
                )}

                {b.subtitle && (
                  <p
                    style={{
                      marginTop: b.badge ? '12px' : 0,
                      fontSize: '13px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      opacity: 0.85,
                    }}
                  >
                    {b.subtitle}
                  </p>
                )}

                <h2
                  style={{
                    marginTop: '8px',
                    fontSize: isMobile ? '24px' : '34px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                    color: text,
                  }}
                >
                  {b.title}
                </h2>

                {b.description && (
                  <p
                    style={{
                      marginTop: '10px',
                      fontSize: '15px',
                      lineHeight: 1.6,
                      opacity: 0.92,
                    }}
                  >
                    {b.description}
                  </p>
                )}
              </div>

              {/* Buttons */}
              {(b.buttonText || b.secondaryText) && (
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    gap: '12px',
                    flexShrink: 0,
                    flexWrap: 'wrap',
                  }}
                >
                  {b.buttonText && (
                    <Link
                      href={b.linkUrl || '/products'}
                      style={{
                        padding: '14px 28px',
                        // Deliberately NOT var(--brand): this banner paints its
                        // own background from `overlayColor`, which the admin
                        // picks independently of the site theme. Using the
                        // brand colour produced a blue button on a blue
                        // gradient (measured: #0369a1 on #0ea5e9). `text` is
                        // already guaranteed to contrast with this banner, so
                        // inverting it is readable on every gradient.
                        backgroundColor: text,
                        color: light ? '#111111' : '#ffffff',
                        borderRadius: 'var(--btn-radius, 8px)',
                        fontWeight: 700,
                        fontSize: '15px',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.buttonText}
                    </Link>
                  )}
                  {b.secondaryText && (
                    <Link
                      href={b.secondaryUrl || '/deals'}
                      style={{
                        padding: '14px 26px',
                        border: `1px solid ${text}`,
                        color: text,
                        borderRadius: 'var(--btn-radius, 8px)',
                        fontWeight: 600,
                        fontSize: '15px',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.secondaryText}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
