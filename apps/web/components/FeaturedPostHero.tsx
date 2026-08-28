'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getImageUrl } from '@/lib/api';
import { BlogPost, formatPostDate } from '@/lib/blog';
import { DirectionArrow } from '@/components/DirectionArrow';

/**
 * Featured-post hero for the blog index.
 *
 * The pinned post gets a wide editorial card - image beside an oversized
 * headline - instead of being just another tile in the grid. Same data
 * contract as PostCard (data-post-card) so scripts and counts treat it
 * like any other post.
 */
export default function FeaturedPostHero({ post }: { post: BlogPost }) {
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = post.coverImage && !failed;
  const image = showImage ? getImageUrl(post.coverImage!) : null;

  return (
    <Link
      href={`/blog/${post.slug}`}
      data-post-card={post.slug}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)',
        textDecoration: 'none',
        color: 'var(--body-text, #111)',
        border: '1px solid var(--border, #e8e8e8)',
        borderRadius: 'calc(var(--radius, 12px) + 4px)',
        overflow: 'hidden',
        backgroundColor: 'var(--card-bg, #fff)',
        boxShadow: hovered
          ? 'var(--shadow-hover, 0 12px 28px rgba(0,0,0,.10))'
          : 'var(--shadow, none)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'transform 200ms ease, box-shadow 200ms ease',
      }}
    >
      {/* Image side */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 10',
          overflow: 'hidden',
          minHeight: '260px',
        }}
      >
        {image ? (
          <img
            src={image}
            alt={post.title}
            onError={() => setFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              transition: 'transform 500ms ease',
              transform: hovered ? 'scale(1.04)' : 'scale(1)',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              height: '100%',
              background:
                'linear-gradient(135deg, var(--brand, #111) 0%, var(--brand, #111) 60%, var(--accent, #3b82f6) 100%)',
            }}
          />
        )}
        <span
          style={{
            position: 'absolute',
            top: '14px',
            insetInlineStart: '14px',
            padding: '5px 12px',
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
      </div>

      {/* Text side */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '28px 30px',
          justifyContent: 'center',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #888)' }}>
          {post.author ? `${post.author} · ` : ''}
          {formatPostDate(post.publishedAt || post.createdAt)} · {post.readingMinutes} min read
        </p>
        <h2
          style={{
            margin: 0,
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 'var(--heading-weight, 800)' as any,
            letterSpacing: '-0.02em',
            lineHeight: 1.18,
          }}
        >
          {post.title}
        </h2>
        {post.excerpt && (
          <p
            style={{
              margin: 0,
              fontSize: '15px',
              color: 'var(--muted, #666)',
              lineHeight: 1.65,
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {post.excerpt}
          </p>
        )}
        {post.tags.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
              marginTop: 'auto',
              paddingTop: '4px',
            }}
          >
            {post.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                style={{
                  fontSize: '11px',
                  padding: '3px 10px',
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
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--accent, #3b82f6)',
          }}
        >
          Read post
          <DirectionArrow kind="forward" />
        </span>
      </div>
    </Link>
  );
}
