'use client';

/**
 * Home page image gallery.
 *
 * Content lives in the `gallery` HomeSection's `config.items`, so every tile
 * (image, caption, link) is admin-editable and stored in the database.
 *
 * Two layouts:
 *   masonry - CSS columns, tiles keep their natural aspect ratio
 *   grid    - uniform squares
 *
 * A tile with no image renders a deterministic coloured placeholder rather
 * than a broken <img>, so a fresh install looks complete before the owner has
 * uploaded anything. Same reasoning as PlaceholderTile on the product cards:
 * the seed images referenced by the demo data do not exist on disk.
 */

import { useState } from 'react';
import Link from 'next/link';
import { getImageUrl } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import StoreImage from './StoreImage';

export interface GalleryItem {
  image?: string;
  caption?: string;
  linkUrl?: string;
  tone?: string;
}

const CONTAINER = 'var(--container, 1200px)';

/**
 * Tile heights for the masonry layout.
 *
 * `170 + (index * 37) % 90` looked varied but was not: CSS columns fill
 * top-to-bottom, so a drifting sequence pushed most of the height into the
 * first columns and left the last one with a single tile and a large gap
 * (visible with the default 6 items in a 4-column layout).
 *
 * A short repeating cycle whose length is coprime with the common column
 * counts (2,3,4,6) keeps every column within roughly one tile of the others.
 */
const MASONRY_HEIGHTS = [230, 180, 265, 200, 245, 190, 210, 255];

/** Stable pastel from a string, so a tile's colour never changes between loads. */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function Tile({
  item,
  index,
  square,
}: {
  item: GalleryItem;
  index: number;
  square: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = item.image && !failed;

  const seed = item.caption || `tile-${index}`;
  const hue = hashHue(seed);
  const tone = item.tone;

  const inner = (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius, 12px)',
        border: '1px solid var(--border, #e8e8e8)',
        backgroundColor: 'var(--card-bg, #fff)',
        boxShadow: hovered ? 'var(--shadow-hover, 0 12px 28px rgba(0,0,0,.10))' : 'var(--shadow, none)',
        transform: hovered ? 'translateY(-3px)' : 'none',
        transition: 'transform 200ms ease, box-shadow 200ms ease',
        // masonry: let the tile size itself; grid: force a square
        aspectRatio: square ? '1' : undefined,
        minHeight: square ? undefined : `${MASONRY_HEIGHTS[index % MASONRY_HEIGHTS.length]}px`,
        display: 'block',
        breakInside: 'avoid',
        marginBottom: square ? 0 : '16px',
      }}
    >
      {showImage ? (
        <StoreImage
          src={getImageUrl(item.image!)}
          alt={item.caption || ''}
          onError={() => setFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            transition: 'transform 500ms ease',
            transform: hovered ? 'scale(1.06)' : 'scale(1)',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            minHeight: 'inherit',
            background: tone
              ? `linear-gradient(135deg, ${tone} 0%, ${tone}bb 100%)`
              : `linear-gradient(135deg, hsl(${hue},62%,72%) 0%, hsl(${(hue + 40) % 360},58%,58%) 100%)`,
          }}
        />
      )}

      {item.caption && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '26px 14px 12px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.68), rgba(0,0,0,0))',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          {item.caption}
        </div>
      )}
    </div>
  );

  if (item.linkUrl) {
    return (
      <Link
        href={item.linkUrl}
        style={{ textDecoration: 'none', display: 'block', breakInside: 'avoid' }}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function HomeGallery({
  title,
  subtitle,
  items,
  layout = 'masonry',
  columns = 4,
}: {
  title?: string | null;
  subtitle?: string | null;
  items?: GalleryItem[];
  layout?: 'masonry' | 'grid';
  columns?: number;
}) {
  const isMobile = useIsMobile();
  const list = Array.isArray(items) ? items : [];

  // Nothing configured: render nothing rather than an empty heading.
  if (list.length === 0) return null;

  const cols = isMobile ? 2 : Math.max(2, Math.min(6, columns || 4));
  const square = layout === 'grid';

  return (
    <section style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '64px 20px 0' }}>
      {(title || subtitle) && (
        <div style={{ marginBottom: '28px' }}>
          {title && (
            <h2
              style={{
                fontSize: isMobile ? '22px' : '30px',
                fontWeight: 'var(--heading-weight, 800)' as any,
                letterSpacing: '-0.01em',
                color: 'var(--body-text, #111)',
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ marginTop: '8px', color: 'var(--muted, #666)', fontSize: '15px' }}>
              {subtitle}
            </p>
          )}
        </div>
      )}

      {square ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px' }}>
          {list.map((it, i) => (
            <Tile key={i} item={it} index={i} square />
          ))}
        </div>
      ) : (
        // CSS multi-column gives a masonry look with no JS and no layout shift.
        <div style={{ columnCount: cols, columnGap: '16px' }}>
          {list.map((it, i) => (
            <Tile key={i} item={it} index={i} square={false} />
          ))}
        </div>
      )}
    </section>
  );
}
