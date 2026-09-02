/**
 * Bold theme — Hero section.
 *
 * A full-bleed, split-screen hero. Left half: the marketing
 * copy, set in heavy display type, with a single high-contrast
 * call to action. Right half: a single product image (or
 * gradient placeholder) that takes the full half. The split is
 * 50/50 on desktop, stacks on phones.
 *
 * Where Minimal's hero is one line of text on a quiet
 * background, Bold's hero is a poster — designed to be the
 * page's loudest element. The store name is the visual
 * signature; the product image is the product.
 */

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useStoreSettings } from '@/lib/settings';
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function BoldHero({ banners }: SectionProps) {
  const { settings } = useStoreSettings();
  const theme = useTheme();
  // The first admin banner drives the poster. When the merchant has
  // set one up, its title, copy, CTA and image replace the
  // store-settings text so the hero is actually controllable from
  // the admin (previously the banner data was destructured away and
  // the right half always showed the placeholder).
  const first = banners?.[0];
  const image = first?.image || null;
  const headline =
    first?.title ||
    (settings.storeDescription || 'Look at this.').split('.')[0];
  const subcopy =
    first?.subtitle ||
    first?.description ||
    settings.storeDescription?.split('.').slice(1).join('.').trim() ||
    'A new collection. Limited run. No restocks.';
  const ctaHref = first?.linkUrl || '/products';
  const ctaLabel = first?.buttonText || 'Shop the drop';
  // The Bold hero is loud on purpose. The single product
  // image on the right takes a fixed aspect ratio so the
  // hero has a consistent visual weight regardless of the
  // source image. (If the merchant doesn't have a hero
  // image yet, we show a CSS gradient as a placeholder -
  // this is the dark theme's "above the fold" so a
  // missing image would look broken.)
  const fallbackGradient =
    'linear-gradient(135deg, #f97316 0%, #facc15 50%, #0a0a0a 100%)';

  return (
    <section
      data-section="hero"
      data-theme={theme.activeTheme}
      style={{
        // minHeight 80vh on mobile (taller than the default's
        // 60vh) because Bold is a poster; on desktop it's
        // 100vh - the entire first screen.
        minHeight: '80vh',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        // The default grid behaviour stacks at <720px
        // (two 360px columns won't fit on a phone). The
        // explicit media query could replace this; inline
        // minmax works for the common case.
        backgroundColor: 'var(--body-bg, #0a0a0a)',
        color: 'var(--body-text, #fafafa)',
        overflow: 'hidden',
      }}
    >
      {/* Left half: copy */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 'clamp(40px, 8vw, 96px)',
          backgroundColor: 'var(--body-bg, #0a0a0a)',
        }}
      >
        <p
          style={{
            // The "tagline" before the headline - small
            // uppercase, accent colour. Same pattern Minimal
            // uses but louder (accent colour, not muted).
            fontSize: '13px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--accent, #facc15)',
            margin: 0,
            marginBottom: '24px',
            fontWeight: 700,
          }}
        >
          {first?.badge || `${settings.storeName} presents`}
        </p>
        <h1
          style={{
            // Display-size on desktop, large on mobile.
            // The font-weight 900 is the heaviest available;
            // it makes the headline feel "stamped" rather
            // than "typed".
            fontSize: 'clamp(48px, 8vw, 96px)',
            lineHeight: 0.95,
            fontWeight: 900,
            color: 'var(--body-text, #fafafa)',
            margin: 0,
            marginBottom: '32px',
            letterSpacing: '-0.03em',
            // A 2-line clamp for the headline. 3+ lines
            // would make the hero feel text-heavy and undercut
            // the "loud" intent.
            maxWidth: '14ch',
            textTransform: 'uppercase',
          }}
        >
          {headline}
        </h1>
        <p
          style={{
            fontSize: '18px',
            lineHeight: 1.5,
            color: 'var(--muted, #a1a1aa)',
            maxWidth: '40ch',
            margin: 0,
            marginBottom: '40px',
          }}
        >
          {/* Secondary line below the headline. Kept short
              - the Bold theme's hero is the headline, not
              the body copy. */}
          {subcopy}
        </p>
        <Link
          href={ctaHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            padding: '20px 32px',
            backgroundColor: 'var(--accent, #facc15)',
            color: 'var(--body-bg, #0a0a0a)',
            textDecoration: 'none',
            // Bold's signature: heavy weight, uppercase,
            // tracking-out. Reads as a poster, not a button.
            fontSize: '14px',
            fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            // Zero radius - Bold doesn't do rounded.
            borderRadius: 0,
            transition: 'transform 0.18s ease',
            // Slightly oversized tap target for a poster
            // CTA - it should feel physical.
            alignSelf: 'flex-start',
            minHeight: '56px',
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
          {ctaLabel}
          <DirectionArrow kind="forward" />
        </Link>
      </div>

      {/* Right half: the banner image (or gradient placeholder) */}
      <div
        style={{
          // Aspect ratio 1:1 on the right half so the hero
          // has a consistent visual weight regardless of the
          // banner image's natural aspect. The merchant can
          // change this in the admin later if they want a
          // wider hero.
          position: 'relative',
          aspectRatio: '1',
          background: image ? '#171717' : fallbackGradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // The "LOOK AT ME" badge in the corner. A
          // decorative element that reinforces the theme's
          // tone.
          overflow: 'hidden',
        }}
      >
        {image ? (
          <img
            src={getImageUrl(image)}
            alt={first?.title || settings.storeName}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              // The "no image uploaded" placeholder. Real
              // banner images render in front of this once
              // the admin attaches one; for now the
              // gradient is what the merchant sees.
              fontSize: '24px',
              fontWeight: 900,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              padding: '16px 24px',
              border: '2px dashed rgba(255,255,255,0.4)',
            }}
          >
            Hero image
          </span>
        )}
      </div>
    </section>
  );
}
