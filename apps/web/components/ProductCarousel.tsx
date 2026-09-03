// ProductCarousel - a generic horizontal product row used on the
// home page (new arrivals / trending feeds) and the PDP. Takes
// pre-fetched products; no data fetching of its own.

'use client';

import { useRef, useState, useEffect, useCallback, useContext, useId } from 'react';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { I18nSeedContext } from '@/lib/i18n';
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
  const headingId = useId();

  // The storefront ships Kurdish, Arabic and Persian. In an RTL flex row the
  // browser scrolls with NEGATIVE scrollLeft (0 at the start, decreasing
  // toward the end), so every calculation below has to know the direction.
  const seed = useContext(I18nSeedContext);
  const isRtl = seed?.dir === 'rtl';

  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  // Whether the row actually overflows. Driven by measurement rather than a
  // product count: the old `products.length > 4` was tuned for a 1200px
  // container, so on a narrower desktop window four cards overflowed with no
  // arrows and a deliberately hidden scrollbar - the extra products could not
  // be reached at all.
  const [overflowing, setOverflowing] = useState(false);

  const cardWidth = isMobile ? 200 : 260;

  const updateArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;

    // Normalise to "distance travelled from the start", which is positive in
    // both directions and makes the two bounds checks identical.
    const travelled = Math.abs(el.scrollLeft);
    const maxTravel = el.scrollWidth - el.clientWidth;

    // 4px tolerance: fractional scroll widths never hit an exact equality.
    setOverflowing(maxTravel > 4);
    setAtStart(travelled <= 4);
    // Guard on maxTravel: before layout (and in jsdom) every dimension is 0,
    // which would otherwise report "at the end" and render both arrows dead
    // on first paint.
    setAtEnd(maxTravel > 4 ? travelled >= maxTravel - 4 : true);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scroller.current;
    if (!el) return;

    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);

    // Re-measure when the row itself changes size - a font swap, an image
    // finishing decode, or a container query. A resize listener alone misses
    // all of those, which is how a row silently loses its arrows.
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateArrows);
      ro.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
      ro?.disconnect();
    };
  }, [updateArrows, products.length]);

  const scrollBy = (dir: -1 | 1) => {
    // `dir` is logical: -1 = back, +1 = forward. In RTL forward means moving
    // toward negative scrollLeft, so flip the physical delta. Without this the
    // "next" button scrolls away from the content and the row looks frozen.
    const physical = isRtl ? -dir : dir;
    scroller.current?.scrollBy({
      left: physical * (cardWidth + 20) * 2,
      behavior: 'smooth',
    });
  };

  // Nothing to show - render nothing rather than an empty heading.
  if (!products || products.length === 0) return null;

  // Measured overflow, but keep a count-based fallback for the first paint
  // (and for any environment without layout) so the arrows are not missing
  // in the common case before the effect runs.
  const showArrows = !isMobile && (overflowing || products.length > 4);

  return (
    <section
      aria-labelledby={headingId}
      style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px 0' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2
            id={headingId}
            style={{ fontSize: isMobile ? '22px' : '30px', fontWeight: 800, letterSpacing: '-0.01em' }}
          >
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
              <DirectionArrow kind="forward" /> View all
            </Link>
          )}
          {showArrows && (
            <>
              <button
                aria-label="Scroll left"
                onClick={() => scrollBy(-1)}
                disabled={atStart}
                style={navBtn(atStart)}
              >
                {/* Mirror the chevrons in RTL: a hardcoded pair pointed the
                    "next" button back the way the reader came. */}
                {isRtl ? '\u203a' : '\u2039'}
              </button>
              <button
                aria-label="Scroll right"
                onClick={() => scrollBy(1)}
                disabled={atEnd}
                style={navBtn(atEnd)}
              >
                {isRtl ? '\u2039' : '\u203a'}
              </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={scroller}
        // Focusable so the row can be scrolled with the keyboard. Without it
        // the arrows are the only way through - and they are hidden on mobile
        // and absent for keyboard users on a narrow desktop window.
        tabIndex={0}
        role="region"
        aria-label={title}
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
    border: '1px solid var(--border, #e0e0e0)',
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
