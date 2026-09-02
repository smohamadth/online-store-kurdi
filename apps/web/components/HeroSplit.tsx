// HeroSplit - a "split" hero layout for the platform/default hero.
//
// The classic modern-storefront hero: one rounded band on the page
// background, with the marketing copy on one side and the banner photo
// on the other. Unlike the full-bleed slideshow (HeroGallery) the copy
// never sits on the photo, so contrast comes from the theme tokens and
// stays correct in every preset (including dark ones) without relying
// on the banner's stored text/overlay colours.
//
// It renders a single banner statically - no autoplay, no arrows, no
// dots. Chosen from the hero block in the Home builder (layout =
// "split"); themes that ship their own hero design can also import and
// reuse this component.
//
// Direction-aware: the copy column is the first grid item, so in an RTL
// document it lands on the reading-start side and the media mirrors.

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { getImageUrl } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import { HERO_HEIGHT_PX, type HeroHeight } from '@/lib/heroOptions';
import { resolveSlideBackground, type Banner } from './HeroGallery';

interface Props {
  banner?: Banner | null;
  /** Band height preset. Default "standard". */
  height?: HeroHeight;
  /** Renders nothing when no banner is configured. */
}

export default function HeroSplit({ banner, height = 'standard' }: Props) {
  const isMobile = useIsMobile();
  if (!banner) return null;

  const preset = HERO_HEIGHT_PX[height] ?? HERO_HEIGHT_PX.standard;
  const img =
    (isMobile && banner.mobileImage) || banner.image || '';
  const hasMedia = Boolean(img);

  return (
    <section
      data-section="hero"
      style={{
        backgroundColor: 'var(--body-bg, #ffffff)',
        padding: isMobile ? '16px 12px' : '32px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--container, 1200px)',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.05fr) minmax(0, 1fr)',
            minHeight: isMobile ? undefined : `${preset.desktop}px`,
            overflow: 'hidden',
            borderRadius: 'calc(var(--radius, 8px) + 6px)',
            border: '1px solid var(--border, #e5e7eb)',
            boxShadow: 'var(--shadow, none)',
            backgroundColor: 'var(--card-bg, #ffffff)',
          }}
        >
          {/* Copy column */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'flex-start',
              padding: isMobile ? '36px 24px' : 'clamp(36px, 6vw, 72px)',
            }}
          >
            {banner.badge && (
              <span
                style={{
                  display: 'inline-block',
                  padding: '5px 12px',
                  borderRadius: '999px',
                  backgroundColor: 'var(--surface-2, #f1f1f1)',
                  color: 'var(--muted, #6b7280)',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '18px',
                }}
              >
                {banner.badge}
              </span>
            )}
            {banner.subtitle && (
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted, #6b7280)',
                }}
              >
                {banner.subtitle}
              </p>
            )}
            <h1
              style={{
                fontSize: isMobile ? 'clamp(26px, 6vw, 40px)' : 'clamp(32px, 4.5vw, 52px)',
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                fontWeight: 'var(--heading-weight, 800)',
                color: 'var(--body-text, #111111)',
                margin: 0,
                maxWidth: '18ch',
              }}
            >
              {banner.title}
            </h1>
            {banner.description && (
              <p
                style={{
                  margin: '16px 0 0',
                  fontSize: isMobile ? '15px' : '17px',
                  lineHeight: 1.6,
                  color: 'var(--muted, #6b7280)',
                  maxWidth: '46ch',
                }}
              >
                {banner.description}
              </p>
            )}
            <div
              style={{
                marginTop: '28px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Link
                href={banner.linkUrl || '/products'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 26px',
                  backgroundColor: 'var(--brand, #111111)',
                  color: 'var(--brand-text, #ffffff)',
                  borderRadius: 'var(--btn-radius, 8px)',
                  fontSize: '15px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  transition: 'transform 0.18s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                onFocus={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {banner.buttonText || 'Shop now'}
                <DirectionArrow kind="forward" />
              </Link>
              {banner.secondaryText && banner.secondaryUrl && (
                <Link
                  href={banner.secondaryUrl}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '14px 18px',
                    border: '1px solid var(--border, #e5e7eb)',
                    color: 'var(--body-text, #111111)',
                    borderRadius: 'var(--btn-radius, 8px)',
                    fontSize: '14px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    transition: 'transform 0.18s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.03)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.transform = 'scale(1.03)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {banner.secondaryText}
                  <DirectionArrow kind="forward" />
                </Link>
              )}
            </div>
          </div>

          {/* Media column: photo (or the banner's own colour/gradient) */}
          <div
            style={{
              position: 'relative',
              minHeight: isMobile ? '240px' : undefined,
              backgroundImage: hasMedia
                ? `url(${getImageUrl(img)})`
                : resolveSlideBackground(banner.overlayColor),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderTop: isMobile ? '1px solid var(--border, #e5e7eb)' : 'none',
            }}
          />
        </div>
      </div>
    </section>
  );
}
