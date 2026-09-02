'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getImageUrl } from '@/lib/api';
import { BlogPost, formatPostDate } from '@/lib/blog';
import { DirectionArrow } from '@/components/DirectionArrow';
import StoreImage from '@/components/StoreImage';

/**
 * One post in the blog grid.
 *
 * A post with no cover image draws a deterministic coloured tile rather than a
 * broken <img>, matching how ProductCard and HomeGallery already handle
 * missing images — a shop that has not uploaded artwork should still look
 * finished.
 */

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default function PostCard({ post }: { post: BlogPost }) {
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = post.coverImage && !failed;
  const hue = hashHue(post.title || post.slug);

  return (
    <Link
      href={`/blog/${post.slug}`}
      data-post-card={post.slug}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        color: 'var(--body-text, #111)',
        border: '1px solid var(--border, #e8e8e8)',
        borderRadius: 'var(--radius, 12px)',
        overflow: 'hidden',
        backgroundColor: 'var(--card-bg, #fff)',
        boxShadow: hovered ? 'var(--shadow-hover, 0 12px 28px rgba(0,0,0,.10))' : 'var(--shadow, none)',
        transform: hovered ? 'translateY(-3px)' : 'none',
        transition: 'transform 200ms ease, box-shadow 200ms ease',
        height: '100%',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden' }}>
        {showImage ? (
          <StoreImage
            src={getImageUrl(post.coverImage!)}
            alt={post.title}
            fill
            onError={() => setFailed(true)}
            style={{
              objectFit: 'cover',
              transition: 'transform 500ms ease',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(135deg, hsl(${hue},62%,72%) 0%, hsl(${(hue + 40) % 360},58%,56%) 100%)`,
            }}
          />
        )}
        {post.isFeatured && (
          <span
            style={{
              position: 'absolute',
              top: '10px',
              insetInlineStart: '10px',
              padding: '4px 10px',
              borderRadius: '999px',
              backgroundColor: 'var(--sale, #dc2626)',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Featured
          </span>
        )}
      </div>

      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        <p style={{ fontSize: '12px', color: 'var(--muted, #888)' }}>
          {formatPostDate(post.publishedAt || post.createdAt)} · {post.readingMinutes} min read
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.3 }}>{post.title}</h2>

        {post.excerpt && (
          <p
            style={{
              fontSize: '14px',
              color: 'var(--muted, #666)',
              lineHeight: 1.6,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {post.excerpt}
          </p>
        )}

        {/* Fixed-height bottom row: tags always, plus a "Read post"
            affordance that fades in on hover (height reserved so the
            card never jumps). */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {post.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {post.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: '11px',
                    padding: '3px 9px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--body-bg, #f3f4f6)',
                    border: '1px solid var(--border, #e5e5e5)',
                    color: 'var(--muted, #555)',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--accent, #3b82f6)',
              opacity: hovered ? 1 : 0,
              transform: hovered ? 'none' : 'translateY(2px)',
              transition: 'opacity 200ms ease, transform 200ms ease',
              height: '18px',
            }}
          >
            Read post
            <DirectionArrow kind="forward" />
          </span>
        </div>
      </div>
    </Link>
  );
}
