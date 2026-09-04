// HeroGallery - the home page hero slider: cycles the store's active
// hero banners (from /api/banners?position=hero) with an autoplay
// interval + arrows/dots. With no active hero it renders nothing
// (the admin may have scheduled them all off).

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { getImageUrl } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import { HERO_HEIGHT_PX, type HeroHeight } from '@/lib/heroOptions';

export interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  image: string;
  mobileImage?: string | null;
  linkUrl?: string | null;
  buttonText?: string | null;
  secondaryText?: string | null;
  secondaryUrl?: string | null;
  badge?: string | null;
  textColor?: string;
  overlayColor?: string;
  align?: string;
  position?: string;
}

/**
 * Decide what sits behind a banner slide that has NO image.
 *
 * `overlayColor` doubles as the background: gradients are always used as
 * the backdrop, and so are solid colours (hex / rgb / fully-opaque rgba) -
 * an admin who types `#f59e0b` as the colour gets an amber band, not a
 * surprise navy one. The one thing that is NOT treated as a background is
 * the form's default `rgba(0,0,0,0.35)`: that is a *scrim* meant to sit on
 * top of a photo, and using it on an empty background would put white text
 * on near-transparent black. Those slides keep the classic dark gradient.
 */
export function looksLikeScrim(overlayColor?: string | null): boolean {
  if (!overlayColor) return true; // nothing supplied - use the default band
  if (overlayColor.includes('gradient')) return false;
  const m = overlayColor.match(/rgba?\(([^)]*)\)/i);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
    // rgba with an explicit alpha below ~0.85 reads as a scrim.
    if (parts.length >= 4 && Number.isFinite(parts[3])) return parts[3] < 0.85;
    return false; // rgb(...) without alpha = solid
  }
  return false; // hex / named colour = solid
}

export function resolveSlideBackground(overlayColor?: string | null): string {
  if (overlayColor && !looksLikeScrim(overlayColor)) return overlayColor;
  return 'linear-gradient(120deg, #1a1a2e, #16213e)';
}

const DEFAULT_SLIDES: Banner[] = [
  {
    id: 'default-1',
    title: 'Discover Amazing Products',
    subtitle: 'New Season',
    description:
      'Shop the latest electronics, clothing, books and digital products with fast shipping and great support.',
    image: '',
    linkUrl: '/products',
    buttonText: 'Shop Now',
    secondaryText: 'View Deals',
    secondaryUrl: '/deals',
    badge: 'Featured',
    textColor: '#ffffff',
    overlayColor: 'linear-gradient(120deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
    align: 'left',
  },
  {
    id: 'default-2',
    title: 'Up to 50% Off Selected Items',
    subtitle: 'Limited Time',
    description: 'Grab the best deals of the season before they are gone.',
    image: '',
    linkUrl: '/deals',
    buttonText: 'Browse Deals',
    textColor: '#ffffff',
    overlayColor: 'linear-gradient(120deg, #7f1d1d 0%, #b91c1c 55%, #f97316 100%)',
    align: 'left',
  },
  {
    id: 'default-3',
    title: 'Free Shipping On Orders Over 50',
    subtitle: 'Every Day',
    description: 'Fast, tracked delivery straight to your door.',
    image: '',
    linkUrl: '/products',
    buttonText: 'Start Shopping',
    textColor: '#ffffff',
    overlayColor: 'linear-gradient(120deg, #064e3b 0%, #047857 60%, #10b981 100%)',
    align: 'left',
  },
];

interface Props {
  banners?: Banner[];
  /**
   * True once the banners API has responded. Until then we cannot tell an
   * unconfigured store from a slow network, so we render a placeholder rather
   * than guessing.
   */
  loaded?: boolean;
  /** Autoplay delay in ms. Ignored when `autoPlay` is false. */
  autoPlayMs?: number;
  /** Rotate automatically. Default true. */
  autoPlay?: boolean;
  /** Show the prev/next arrow buttons (desktop). Default true. */
  showArrows?: boolean;
  /** Show the slide dots. Default true. */
  showDots?: boolean;
  /** Band height preset. Default "standard" (520/420px). */
  height?: HeroHeight;
}

export default function HeroGallery({
  banners,
  loaded = false,
  autoPlayMs = 6000,
  autoPlay = true,
  showArrows = true,
  showDots = true,
  height = 'standard',
}: Props) {
  const isMobile = useIsMobile();

  // The DATABASE is the source of truth.
  //
  // This used to fall back to DEFAULT_SLIDES whenever `banners` was empty,
  // which meant an admin who deleted or hid every slide still saw three
  // hardcoded slides on the storefront - the gallery was not actually
  // controllable from the admin panel. The built-in slides are now only a
  // pre-load placeholder, never a substitute for real data.
  const hasData = Array.isArray(banners) && banners.length > 0;
  const slides = hasData ? banners! : loaded ? [] : DEFAULT_SLIDES;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Respect users who ask for reduced motion: no autoplay, no zoom.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || count <= 1 || !autoPlay) return;
    const t = setTimeout(next, autoPlayMs);
    return () => clearTimeout(t);
  }, [index, paused, reducedMotion, count, next, autoPlayMs, autoPlay]);

  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    const el = containerRef.current;
    el?.addEventListener('keydown', onKey as any);
    return () => el?.removeEventListener('keydown', onKey as any);
  }, [next, prev]);

  const bandHeightPx = isMobile
    ? HERO_HEIGHT_PX[height]?.mobile ?? HERO_HEIGHT_PX.standard.mobile
    : HERO_HEIGHT_PX[height]?.desktop ?? HERO_HEIGHT_PX.standard.desktop;
  const bandHeight = `${bandHeightPx}px`;

  // Admin has no active hero slides: render nothing rather than inventing
  // content the store owner never configured.
  if (count === 0) return null;

  return (
    <section
      ref={containerRef}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        if (start !== null) {
          const delta = e.changedTouches[0].clientX - start;
          if (Math.abs(delta) > 50) (delta < 0 ? next : prev)();
        }
        touchStart.current = null;
        setPaused(false);
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: bandHeight,
        overflow: 'hidden',
        backgroundColor: '#0f0f17',
        outline: 'none',
      }}
    >
      {slides.map((slide, i) => {
        const active = i === index;
        const img = isMobile && slide.mobileImage ? slide.mobileImage : slide.image;
        const align = slide.align || 'left';
        const overlay = slide.overlayColor || 'rgba(0,0,0,0.4)';
        const fill = resolveSlideBackground(overlay);
        const copyFirst = align !== 'right';
        return (
          <div
            key={slide.id}
            aria-hidden={!active}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: active ? 1 : 0,
              pointerEvents: active ? 'auto' : 'none',
              visibility: active ? 'visible' : 'hidden',
              transition: reducedMotion ? 'opacity 200ms linear' : 'opacity 500ms ease',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: fill,
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.18), transparent 42%), radial-gradient(ellipse at 10% 90%, rgba(0,0,0,0.28), transparent 50%)',
                pointerEvents: 'none',
              }}
            />

            <div
              style={{
                position: 'relative',
                height: '100%',
                maxWidth: '1240px',
                margin: '0 auto',
                padding: isMobile ? '28px 20px 56px' : '40px 56px 64px',
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : copyFirst ? 'minmax(0, 1.05fr) minmax(280px, 1fr)' : 'minmax(280px, 1fr) minmax(0, 1.05fr)',
                gap: isMobile ? 20 : 40,
                alignItems: 'center',
                color: slide.textColor || '#ffffff',
              }}
            >
              <div
                style={{
                  order: isMobile ? 0 : copyFirst ? 0 : 1,
                  maxWidth: '36rem',
                  transform: reducedMotion ? 'none' : active ? 'translateY(0)' : 'translateY(18px)',
                  opacity: active ? 1 : 0,
                  transition: reducedMotion ? 'opacity 200ms linear' : 'all 600ms ease 80ms',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 12,
                      letterSpacing: '0.18em',
                      opacity: 0.7,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
                  </span>
                  {slide.badge && (
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '5px 12px',
                        borderRadius: 999,
                        backgroundColor: 'var(--brand, #fff)',
                        color: 'var(--brand-text, #111)',
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {slide.badge}
                    </span>
                  )}
                </div>
                {slide.subtitle && (
                  <p
                    style={{
                      fontSize: isMobile ? 12 : 13,
                      fontWeight: 700,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      opacity: 0.8,
                      margin: '0 0 10px',
                    }}
                  >
                    {slide.subtitle}
                  </p>
                )}
                <Heading
                  level={i === 0 ? 1 : 2}
                  style={{
                    fontSize: isMobile ? 32 : 56,
                    lineHeight: 0.98,
                    fontWeight: 800,
                    letterSpacing: '-0.04em',
                    margin: 0,
                    maxWidth: '14ch',
                  }}
                >
                  {slide.title}
                </Heading>
                {slide.description && (
                  <p
                    style={{
                      marginTop: 16,
                      fontSize: isMobile ? 15 : 17,
                      lineHeight: 1.55,
                      opacity: 0.88,
                      maxWidth: '42ch',
                    }}
                  >
                    {slide.description}
                  </p>
                )}
                <div
                  style={{
                    marginTop: 28,
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  {slide.linkUrl && (
                    <Link
                      href={slide.linkUrl}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '14px 26px',
                        backgroundColor: 'var(--brand, #fff)',
                        color: 'var(--brand-text, #111)',
                        borderRadius: 999,
                        fontSize: 14,
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        textDecoration: 'none',
                        boxShadow: '0 16px 40px rgba(0,0,0,0.28)',
                      }}
                    >
                      {slide.buttonText || 'Shop Now'}
                      <DirectionArrow kind="forward" />
                    </Link>
                  )}
                  {slide.secondaryText && slide.secondaryUrl && (
                    <Link
                      href={slide.secondaryUrl}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '14px 22px',
                        border: '1px solid rgba(255,255,255,0.45)',
                        borderRadius: 999,
                        fontSize: 14,
                        fontWeight: 600,
                        color: slide.textColor || '#fff',
                        textDecoration: 'none',
                        background: 'rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(10px)',
                      }}
                    >
                      {slide.secondaryText}
                    </Link>
                  )}
                </div>
              </div>

              <div
                style={{
                  order: isMobile ? 1 : copyFirst ? 1 : 0,
                  position: 'relative',
                  height: isMobile ? 200 : '100%',
                  minHeight: isMobile ? 180 : 320,
                  borderRadius: 28,
                  overflow: 'hidden',
                  boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
                  border: '1px solid rgba(255,255,255,0.16)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: img
                      ? `url(${getImageUrl(img)}) center/cover no-repeat`
                      : fill,
                    transform: reducedMotion ? 'none' : active ? 'scale(1)' : 'scale(1.08)',
                    transition: reducedMotion ? undefined : 'transform 6s linear',
                  }}
                />
                {!img && (
                  <div aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
                    <span
                      style={{
                        position: 'absolute',
                        width: '55%',
                        height: '55%',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.14)',
                        top: '-12%',
                        insetInlineEnd: '-8%',
                        filter: 'blur(2px)',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        width: '40%',
                        height: '40%',
                        borderRadius: 24,
                        border: '1px solid rgba(255,255,255,0.28)',
                        bottom: '12%',
                        insetInlineStart: '10%',
                        transform: 'rotate(-12deg)',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        insetInlineEnd: 20,
                        bottom: 20,
                        fontSize: isMobile ? 48 : 72,
                        fontWeight: 900,
                        letterSpacing: '-0.06em',
                        color: 'rgba(255,255,255,0.22)',
                        lineHeight: 1,
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Arrows */}
      {count > 1 && !isMobile && showArrows && (
        <>
          <button
            aria-label="Previous slide"
            onClick={prev}
            style={arrowStyle('left')}
          >
            ‹
          </button>
          <button aria-label="Next slide" onClick={next} style={arrowStyle('right')}>
            ›
          </button>
        </>
      )}

      {/* Dots / progress */}
      {count > 1 && showDots && (
        <div
          style={{
            position: 'absolute',
            bottom: '22px',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
            zIndex: 3,
          }}
        >
          {slides.map((s, i) => (
            <button
              key={s.id}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              style={{
                width: i === index ? '38px' : '10px',
                height: '10px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                backgroundColor: i === index ? '#ffffff' : 'rgba(255,255,255,0.5)',
                transition: 'width 300ms ease, background-color 300ms ease',
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Heading({
  level,
  style,
  children,
}: {
  level: 1 | 2;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const Tag = (level === 1 ? 'h1' : 'h2') as 'h1' | 'h2';
  return <Tag style={style}>{children}</Tag>;
}

function arrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: '20px',
    transform: 'translateY(-50%)',
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: 'var(--brand-text, #fff)',
    fontSize: '26px',
    lineHeight: '1',
    cursor: 'pointer',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(6px)',
  } as React.CSSProperties;
}
