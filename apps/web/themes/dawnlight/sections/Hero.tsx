/**
 * Dawnlight theme — Hero section.
 *
 * Original implementation in the spirit of Shopify's Dawn theme
 * (the most widely installed store theme in the world): a full-bleed
 * image band with left-aligned marketing copy and a single flat CTA,
 * followed by Dawn's signature "image with text" row when a second
 * banner exists. No gradients, no overlays-by-default - the image
 * carries the section, the copy stays quiet.
 *
 * (Design inspiration only: Dawn's license restricts its code to
 * Shopify themes, so this is a from-scratch re-interpretation.)
 */

'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function DawnlightHero({ banners }: SectionProps) {
  const theme = useTheme();
  const first = banners?.[0];
  const second = banners?.[1];

  return (
    <section data-section="hero" data-theme={theme.activeTheme}>
      {/* Primary band: full-bleed image with a left-aligned copy column. */}
      <div
        style={{
          position: 'relative',
          minHeight: first ? '420px' : '320px',
          display: 'flex',
          alignItems: 'center',
          // A banner whose image is missing (or no banner at all)
          // gets a quiet tinted band so the paper panel still reads
          // as a deliberate composition instead of white-on-white.
          backgroundColor: first?.image
            ? undefined
            : 'var(--surface-2, #f2f2f0)',
          backgroundImage: first?.image
            ? `url(${getImageUrl(first.image)})`
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 'var(--container, 1200px)', margin: '0 auto', padding: '72px 24px' }}>
          <div
            style={{
              // A solid paper panel so the copy reads on any image.
              // Dawn itself uses plain text over a scrim; the panel is
              // this theme's answer without darkening the photo.
              backgroundColor: 'rgba(255, 255, 255, 0.94)',
              border: '1px solid var(--border, #e6e6e6)',
              padding: '40px 44px',
              maxWidth: '520px',
            }}
          >
            {first?.badge && (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '12px',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: 'var(--sale, #b42318)',
                  marginBottom: '16px',
                }}
              >
                {first.badge}
              </span>
            )}
            <h1
              style={{
                fontSize: 'clamp(28px, 4vw, 44px)',
                lineHeight: 1.1,
                fontWeight: 'var(--heading-weight, 600)',
                margin: 0,
                color: 'var(--body-text, #121212)',
              }}
            >
              {first?.title || 'Shop the collection'}
            </h1>
            {(first?.subtitle || first?.description) && (
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: 1.6,
                  color: 'var(--muted, #5c5c5c)',
                  margin: '16px 0 0',
                }}
              >
                {first.subtitle || first.description}
              </p>
            )}
            <Link
              href={first?.linkUrl || '/products'}
              style={{
                display: 'inline-block',
                marginTop: '28px',
                padding: '14px 32px',
                backgroundColor: 'var(--brand, #121212)',
                color: 'var(--brand-text, #ffffff)',
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                border: '1px solid var(--brand, #121212)',
              }}
            >
              {first?.buttonText || 'Shop now'}
            </Link>
          </div>
        </div>
      </div>

      {/* Dawn's "image with text" row, when a second banner exists. */}
      {second && (
        <div
          style={{
            maxWidth: 'var(--container, 1200px)',
            margin: '0 auto',
            padding: '64px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '48px',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              aspectRatio: '4 / 3',
              backgroundColor: second.image ? undefined : '#f7f7f7',
              backgroundImage: second.image
                ? `url(${getImageUrl(second.image)})`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: '1px solid var(--border, #e6e6e6)',
            }}
          />
          <div>
            <h2
              style={{
                fontSize: 'clamp(22px, 3vw, 30px)',
                fontWeight: 'var(--heading-weight, 600)',
                margin: 0,
                color: 'var(--body-text, #121212)',
              }}
            >
              {second.title}
            </h2>
            {(second.subtitle || second.description) && (
              <p style={{ fontSize: '16px', lineHeight: 1.6, color: 'var(--muted, #5c5c5c)', margin: '16px 0 0' }}>
                {second.subtitle || second.description}
              </p>
            )}
            {second.linkUrl && (
              <Link
                href={second.linkUrl}
                style={{
                  display: 'inline-block',
                  marginTop: '24px',
                  padding: '12px 28px',
                  border: '1px solid var(--brand, #121212)',
                  color: 'var(--body-text, #121212)',
                  fontSize: '14px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                }}
              >
                {second.buttonText || 'Learn more'}
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
