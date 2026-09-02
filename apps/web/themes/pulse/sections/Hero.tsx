/**
 * Pulse theme — Hero section.
 *
 * Original implementation in the spirit of the Medusa Next.js starter
 * (one of the most-starred open commerce starters): a single large
 * rounded card on an off-white canvas, split into a copy column and a
 * media column. Copy: a small pill badge, a bold sans headline with an
 * indigo accent word, one line of subtext, and a black pill CTA. Media:
 * the banner image in a matching rounded tile. No full-bleed, no
 * gradients - the card system does the work.
 *
 * (Design inspiration only: Medusa's starter is MIT, but this is a
 * from-scratch re-interpretation for the store-builder's section
 * contract, not a port of its code.)
 */

'use client';

import Link from 'next/link';
import { useStoreSettings } from '@/lib/settings';
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function PulseHero({ banners }: SectionProps) {
  const theme = useTheme();
  const { settings } = useStoreSettings();
  const first = banners?.[0];
  const hasImage = Boolean(first?.image);
  // With no banner configured, the hero speaks with the store's own
  // description (first sentence as the headline, the rest as subtext)
  // instead of a hard-coded demo slogan.
  const description = settings.storeDescription || '';
  const headline =
    first?.title || description.split('.')[0] || 'Built for how you shop now';
  const body =
    first?.subtitle ||
    first?.description ||
    (!first && description
      ? description.split('.').slice(1).join('.').trim() || null
      : null);
  // A gentle lift on hover AND keyboard focus for both pills.
  const ctaZoom = (active: boolean) => (e: React.SyntheticEvent<HTMLElement>) => {
    e.currentTarget.style.transform = active ? 'scale(1.03)' : 'scale(1)';
  };

  return (
    <section
      data-section="hero"
      data-theme={theme.activeTheme}
      style={{
        backgroundColor: 'var(--body-bg, #f8fafc)',
        padding: 'clamp(24px, 4vw, 48px) 24px',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--container, 1280px)',
          margin: '0 auto',
          backgroundColor: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: 'calc(var(--radius, 16px) + 8px)',
          boxShadow: 'var(--shadow, 0 1px 3px rgba(15, 23, 42, 0.06))',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: hasImage ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
        }}
      >
        {/* Copy column */}
        <div style={{ padding: 'clamp(32px, 5vw, 64px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {first?.badge && (
            <span
              style={{
                alignSelf: 'flex-start',
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: 999,
                // Tinted from the accent token (not a hard-coded
                // indigo-50) so a store that overrides the accent
                // colour gets a matching badge.
                backgroundColor:
                  'color-mix(in srgb, var(--accent, #4f46e5) 12%, #ffffff)',
                color: 'var(--accent, #4f46e5)',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '24px',
              }}
            >
              {first.badge}
            </span>
          )}
          <h1
            style={{
              fontSize: 'clamp(30px, 4.5vw, 52px)',
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              fontWeight: 'var(--heading-weight, 700)',
              color: 'var(--body-text, #0f172a)',
              margin: 0,
            }}
          >
            {headline}
          </h1>
          {body && (
            <p
              style={{
                fontSize: '17px',
                lineHeight: 1.6,
                color: 'var(--muted, #64748b)',
                margin: '20px 0 0',
                maxWidth: '440px',
              }}
            >
              {body}
            </p>
          )}
          <div style={{ marginTop: '32px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link
              href={first?.linkUrl || '/products'}
              style={{
                display: 'inline-block',
                padding: '14px 30px',
                borderRadius: 999,
                backgroundColor: 'var(--brand, #0f172a)',
                color: 'var(--brand-text, #ffffff)',
                fontSize: '15px',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'transform 0.18s ease',
              }}
              onMouseEnter={() => ctaZoom(true)}
              onMouseLeave={() => ctaZoom(false)}
              onFocus={() => ctaZoom(true)}
              onBlur={() => ctaZoom(false)}
            >
              {first?.buttonText || 'Shop the collection'}
            </Link>
            {first?.secondaryUrl && (
              <Link
                href={first.secondaryUrl}
                style={{
                  display: 'inline-block',
                  padding: '14px 30px',
                  borderRadius: 999,
                  border: '1px solid var(--border, #e2e8f0)',
                  color: 'var(--body-text, #0f172a)',
                  fontSize: '15px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  backgroundColor: 'var(--card-bg, #ffffff)',
                  transition: 'transform 0.18s ease',
                }}
                onMouseEnter={() => ctaZoom(true)}
                onMouseLeave={() => ctaZoom(false)}
                onFocus={() => ctaZoom(true)}
                onBlur={() => ctaZoom(false)}
              >
                {first?.secondaryText || 'Learn more'}
              </Link>
            )}
          </div>
        </div>

        {/* Media column */}
        {first && first.image && (
          <div
            style={{
              minHeight: '320px',
              backgroundImage: `url(${getImageUrl(first.image)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
      </div>
    </section>
  );
}
