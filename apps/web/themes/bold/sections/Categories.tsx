/**
 * Bold theme — Categories section.
 *
 * Large image cards, 2x2 on desktop, 1-col on mobile. Each
 * card has a full-bleed image, the category name as an
 * overlay, and a "shop →" link.
 *
 * Bold's category cards are the loudest in the system. They
 * exist to be the visual statement of the storefront. The
 * product is what the merchant is selling; the categories
 * are how the merchant says "I have lots of cool stuff."
 */

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useTheme } from '@/lib/theme';
import { getImageUrl } from '@/lib/api';
import type { SectionProps } from '@/lib/themeSections';

export default function BoldCategories({ title, subtitle, categories, config }: SectionProps) {
  const theme = useTheme();
  const limit = (config?.limit as number) ?? 4;
  const list = (categories ?? []).slice(0, limit);
  // Keyboard users get the same image zoom as hover users: the card
  // link drives the scale so focus (not just the mouse) triggers it.
  const zoomImage = (scale: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    const img = e.currentTarget.querySelector('img');
    if (img) img.style.transform = `scale(${scale})`;
  };

  if (list.length === 0) return null;

  return (
    <section
      data-section="categories"
      data-niche="Fashion drop"
      data-theme={theme.activeTheme}
      style={{
        // A dark band that breaks up the page visually.
        // Different from the body's #0a0a0a so the section
        // has its own territory.
        padding: '96px 32px 128px',
        backgroundColor: 'var(--card-bg, #171717)',
        borderTop: '1px solid var(--border, #262626)',
        borderBottom: '1px solid var(--border, #262626)',
      }}
    >
      {(title || subtitle) && (
        <div
          style={{
            maxWidth: 'var(--container, 1400px)',
            margin: '0 auto 64px',
            textAlign: 'center',
          }}
        >
          {title && (
            <h2
              style={{
                fontSize: 'clamp(32px, 5vw, 56px)',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
                color: 'var(--body-text, #fafafa)',
                margin: 0,
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p
              style={{
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--muted, #a1a1aa)',
                margin: '16px 0 0',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div
        style={{
          maxWidth: 'var(--container, 1400px)',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
        }}
      >
        {list.map((cat) => {
          // Categories with images get the full-bleed
          // treatment. Categories without an image get a
          // gradient + name overlay. Either way, the
          // card is big, clickable, and unmissable.
          const hasImage = Boolean(cat.image);
          return (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              style={{
                position: 'relative',
                display: 'block',
                // The card is a tall poster; the height is
                // tied to the viewport so the image
                // dominates the page.
                aspectRatio: '4 / 5',
                overflow: 'hidden',
                background: hasImage
                  ? '#171717'
                  : 'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
                textDecoration: 'none',
                color: 'var(--body-text, #fafafa)',
              }}
              onMouseEnter={zoomImage('1.05')}
              onMouseLeave={zoomImage('1')}
              onFocus={zoomImage('1.05')}
              onBlur={zoomImage('1')}
            >
              {hasImage && (
                <img
                  src={getImageUrl(cat.image!)}
                  alt={cat.name}
                  loading="lazy"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.5s ease',
                  }}
                />
              )}
              {/* The gradient overlay makes the name readable
                  even when the image is bright. Bottom-to-top
                  black gradient, 50% to transparent. */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '32px',
                }}
              >
                <h3
                  style={{
                    fontSize: '28px',
                    fontWeight: 900,
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    margin: 0,
                    marginBottom: '4px',
                    // token-ratchet-ok: sits on the dark image scrim below,
                    // not on the theme background.
                    color: '#fff',
                  }}
                >
                  {cat.name}
                </h3>
                {typeof cat.count === 'number' && (
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      margin: '0 0 10px',
                      // token-ratchet-ok: on the image scrim.
                      color: 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {cat.count} {cat.count === 1 ? 'product' : 'products'}
                  </p>
                )}
                <p
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    margin: 0,
                    // token-ratchet-ok: on the image scrim.
                    color: 'rgba(255,255,255,0.7)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  Shop <DirectionArrow kind="forward" />
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
