'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Product } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import ProductCard from './ProductCard';

interface Props {
  title: string;
  subtitle?: string;
  products: Product[];
  viewAllHref?: string;
  currencySymbol?: string;
}

export default function ProductCarousel({
  title,
  subtitle,
  products,
  viewAllHref,
  currencySymbol = '$',
}: Props) {
  const isMobile = useIsMobile();
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const cardWidth = isMobile ? 200 : 260;

  const updateArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    // 4px tolerance: fractional scroll widths never hit an exact equality.
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scroller.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, products.length]);

  const scrollBy = (dir: -1 | 1) => {
    scroller.current?.scrollBy({ left: dir * (cardWidth + 20) * 2, behavior: 'smooth' });
  };

  // Nothing to show - render nothing rather than an empty heading.
  if (!products || products.length === 0) return null;

  const showArrows = !isMobile && products.length > 4;

  return (
    <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '22px' : '30px', fontWeight: 800, letterSpacing: '-0.01em' }}>
            {title}
          </h2>
          {subtitle && <p style={{ marginTop: '6px', color: 'var(--muted, #666)', fontSize: '15px' }}>{subtitle}</p>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent, #111)', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              View all →
            </Link>
          )}
          {showArrows && (
            <>
              <button aria-label="Scroll left" onClick={() => scrollBy(-1)} disabled={atStart} style={navBtn(atStart)}>
                ‹
              </button>
              <button aria-label="Scroll right" onClick={() => scrollBy(1)} disabled={atEnd} style={navBtn(atEnd)}>
                ›
              </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={scroller}
        style={{
          marginTop: '24px',
          display: 'flex',
          gap: '20px',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingBottom: '8px',
          // Hide the scrollbar without a stylesheet (inline-styles only codebase).
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {products.map((p) => (
          <div key={p.id} style={{ scrollSnapAlign: 'start', display: 'flex' }}>
            <ProductCard product={p} currencySymbol={currencySymbol} width={cardWidth} />
          </div>
        ))}
      </div>
    </section>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '1px solid #e0e0e0',
    backgroundColor: 'var(--card-bg, #fff)',
    color: disabled ? 'var(--muted, #c4c4c4)' : 'var(--body-text, #111)',
    fontSize: '20px',
    lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 200ms ease',
  };
}
