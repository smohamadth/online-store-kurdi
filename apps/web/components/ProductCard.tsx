'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Product, getImageUrl, getCategoryEmoji } from '@/lib/api';
import { formatPrice } from '@/lib/settings';
import { useCart } from '@/lib/store';

interface Props {
  product: Product;
  currencySymbol?: string;
  /** Fixed width for horizontal carousels; omit inside a grid. */
  width?: number;
}

export default function ProductCard({ product, currencySymbol = '$', width }: Props) {
  const [hovered, setHovered] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();

  const primary =
    product.images?.find((i) => i.isPrimary)?.url || product.images?.[0]?.url || '';
  const secondary = product.images?.[1]?.url || '';
  const showImage = primary && !imgFailed;

  const hasDiscount =
    typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
    : 0;

  const outOfStock = product.quantity !== undefined && product.quantity <= 0;
  const lowStock = !outOfStock && product.quantity > 0 && product.quantity <= 5;
  const rating = Number(product.averageRating) || 0;

  const handleAdd = (e: React.MouseEvent) => {
    // The whole card is a link - don't navigate when using the quick action.
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      quantity: 1,
      category: product.category?.name || '',
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <Link
      href={`/products/${product.slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: width ? `${width}px` : undefined,
        flex: width ? '0 0 auto' : undefined,
        overflow: 'hidden',
        borderRadius: 'var(--radius, 12px)',
        border: '1px solid var(--border, #e8e8e8)',
        backgroundColor: 'var(--card-bg, white)',
        textDecoration: 'none',
        color: 'var(--body-text, #111)',
        transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? 'var(--shadow-hover)' : 'var(--shadow)',
        borderColor: hovered ? 'var(--brand, #d4d4d4)' : 'var(--border, #e8e8e8)',
      }}
    >
      {/* Media */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '1',
          backgroundColor: 'var(--card-bg, #f6f6f6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {showImage ? (
          <>
            <img
              src={getImageUrl(primary)}
              alt={product.images?.[0]?.alt || product.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'transform 500ms ease, opacity 300ms ease',
                transform: hovered ? 'scale(1.06)' : 'scale(1)',
                opacity: hovered && secondary ? 0 : 1,
              }}
            />
            {secondary && (
              <img
                src={getImageUrl(secondary)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: hovered ? 1 : 0,
                  transition: 'opacity 300ms ease',
                }}
              />
            )}
          </>
        ) : (
          // Seed/demo data can reference images that are not on disk (404), and
          // some platforms have no emoji font. Use a self-contained tile that
          // renders identically everywhere.
          <PlaceholderTile
            label={product.category?.name || 'Product'}
            emoji={getCategoryEmoji(product.category?.name)}
            seed={product.name}
          />
        )}

        {/* Badges */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'flex-start',
          }}
        >
          {hasDiscount && (
            <span style={badge('var(--sale, #dc2626)')}>-{discountPct}%</span>
          )}
          {/* "Digital" badge sits above the sale badge so it's
              the first thing a shopper sees on a product card.
              A digital SKU is never "out of stock" - hide that
              branch and the low-stock warning. */}
          {product.type === 'digital' && (
            <span
              data-testid="product-card-digital"
              style={badge('var(--success, #16a34a)')}
            >
              ⚡ Digital
            </span>
          )}
          {product.type !== 'digital' && outOfStock && <span style={badge('#6b7280')}>Sold out</span>}
          {product.type !== 'digital' && lowStock && <span style={badge('var(--warning, #d97706)')}>Only {product.quantity} left</span>}
        </div>

        {/* Quick add */}
        <div
          style={{
            position: 'absolute',
            left: '10px',
            right: '10px',
            bottom: '10px',
            transform: hovered ? 'translateY(0)' : 'translateY(12px)',
            opacity: hovered ? 1 : 0,
            transition: 'all 220ms ease',
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          <button
            onClick={handleAdd}
            disabled={outOfStock}
            style={{
              width: '100%',
              padding: '11px 12px',
              borderRadius: 'var(--btn-radius, 8px)',
              border: 'none',
              cursor: outOfStock ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              backgroundColor: outOfStock
                ? 'var(--border, #d4d4d4)'
                : added
                  ? 'var(--success, #16a34a)'
                  : 'var(--brand, #111)',
              // White on the status branches (brand-text can be dark on a
              // light-brand theme); brand-text on the brand branch.
              color: outOfStock || added ? '#fff' : 'var(--brand-text, #fff)',
              transition: 'background-color 200ms ease',
            }}
          >
            {outOfStock ? 'Sold out' : added ? '✓ Added to cart' : 'Add to cart'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
        <p style={{ fontSize: '12px', color: 'var(--muted, #8a8a8a)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {product.category?.name || 'Shop'}
        </p>
        <h3
          style={{
            fontSize: '15px',
            fontWeight: 600,
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {product.name}
        </h3>

        {/* Rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--warning, #d97706)', fontSize: '13px', letterSpacing: '1px' }}>
            {'★'.repeat(Math.round(rating))}
            <span style={{ color: 'currentColor', opacity: 0.28 }}>{'★'.repeat(5 - Math.round(rating))}</span>
          </span>
          <span style={{ fontSize: '12px', color: 'var(--muted, #8a8a8a)' }}>
            {rating > 0 ? rating.toFixed(1) : 'New'}
            {product.reviewCount ? ` (${product.reviewCount})` : ''}
          </span>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '8px', paddingTop: '4px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--price, #111)' }}>
            {formatPrice(product.price, currencySymbol)}
          </span>
          {hasDiscount && (
            <span style={{ fontSize: '14px', color: 'var(--muted, #9a9a9a)', textDecoration: 'line-through' }}>
              {formatPrice(product.compareAtPrice!, currencySymbol)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function badge(bg: string): React.CSSProperties {
  return {
    backgroundColor: bg,
    color: 'var(--brand-text, #fff)',
    fontSize: '11px',
    fontWeight: 800,
    padding: '4px 9px',
    borderRadius: '999px',
    letterSpacing: '0.03em',
  };
}

/**
 * Image fallback that never depends on an external file or an emoji font.
 * Derives a stable hue from the text so tiles differ but stay consistent.
 */
export function PlaceholderTile({
  label,
  emoji,
  seed,
}: {
  label: string;
  emoji?: string;
  seed: string;
}) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  const initials = seed
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        // Explicit light backgroundColor under the gradient: the tile draws its
        // own surface, so its dark label stays readable under dark themes too.
        backgroundColor: `hsl(${hash},62%,94%)`,
        backgroundImage: `linear-gradient(135deg, hsl(${hash},62%,94%) 0%, hsl(${(hash + 40) % 360},58%,88%) 100%)`,
        color: `hsl(${hash},45%,32%)`,
      }}
    >
      <span style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '0.04em' }}>{initials}</span>
      <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.75 }}>
        {label}
      </span>
    </div>
  );
}
