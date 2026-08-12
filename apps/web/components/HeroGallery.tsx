'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getImageUrl } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';

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
  autoPlayMs?: number;
}

export default function HeroGallery({ banners, autoPlayMs = 6000 }: Props) {
  const isMobile = useIsMobile();
  const slides = banners && banners.length > 0 ? banners : DEFAULT_SLIDES;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const t = setTimeout(next, autoPlayMs);
    return () => clearTimeout(t);
  }, [index, paused, count, next, autoPlayMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    const el = containerRef.current;
    el?.addEventListener('keydown', onKey as any);
    return () => el?.removeEventListener('keydown', onKey as any);
  }, [next, prev]);

  const height = isMobile ? '420px' : '520px';

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
        height,
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
        return (
          <div
            key={slide.id}
            aria-hidden={!active}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: active ? 1 : 0,
              transform: active ? 'scale(1)' : 'scale(1.06)',
              transition: 'opacity 700ms ease, transform 7000ms linear',
              pointerEvents: active ? 'auto' : 'none',
            }}
          >
            {/* Background */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: img
                  ? `url(${getImageUrl(img)}) center/cover no-repeat`
                  : overlay.includes('gradient')
                  ? overlay
                  : 'linear-gradient(120deg, #1a1a2e, #16213e)',
              }}
            />
            {/* Overlay for readability when there is a photo */}
            {img && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    align === 'center'
                      ? 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.6))'
                      : align === 'right'
                      ? 'linear-gradient(270deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)'
                      : 'linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)',
                }}
              />
            )}

            {/* Content */}
            <div
              style={{
                position: 'relative',
                height: '100%',
                maxWidth: '1200px',
                margin: '0 auto',
                padding: isMobile ? '0 20px' : '0 32px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                textAlign: align === 'center' ? 'center' : align === 'right' ? 'right' : 'left',
                color: slide.textColor || '#ffffff',
              }}
            >
              <div
                style={{
                  maxWidth: '620px',
                  transform: active ? 'translateY(0)' : 'translateY(24px)',
                  opacity: active ? 1 : 0,
                  transition: 'all 700ms ease 120ms',
                }}
              >
                {slide.badge && (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(255,255,255,0.18)',
                      backdropFilter: 'blur(6px)',
                      border: '1px solid rgba(255,255,255,0.28)',
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      marginBottom: '16px',
                    }}
                  >
                    {slide.badge}
                  </span>
                )}
                {slide.subtitle && (
                  <p
                    style={{
                      fontSize: isMobile ? '13px' : '15px',
                      fontWeight: 600,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      opacity: 0.85,
                      marginBottom: '10px',
                    }}
                  >
                    {slide.subtitle}
                  </p>
                )}
                <h2
                  style={{
                    fontSize: isMobile ? '30px' : '54px',
                    lineHeight: 1.05,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    margin: 0,
                  }}
                >
                  {slide.title}
                </h2>
                {slide.description && (
                  <p
                    style={{
                      marginTop: '18px',
                      fontSize: isMobile ? '15px' : '18px',
                      lineHeight: 1.6,
                      opacity: 0.9,
                    }}
                  >
                    {slide.description}
                  </p>
                )}
                <div
                  style={{
                    marginTop: '28px',
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {slide.linkUrl && (
                    <Link
                      href={slide.linkUrl}
                      style={{
                        padding: '14px 28px',
                        backgroundColor: '#ffffff',
                        color: '#111',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                      }}
                    >
                      {slide.buttonText || 'Shop Now'}
                    </Link>
                  )}
                  {slide.secondaryText && slide.secondaryUrl && (
                    <Link
                      href={slide.secondaryUrl}
                      style={{
                        padding: '14px 24px',
                        border: '1px solid rgba(255,255,255,0.6)',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: slide.textColor || '#fff',
                        textDecoration: 'none',
                      }}
                    >
                      {slide.secondaryText} →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Arrows */}
      {count > 1 && !isMobile && (
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
      {count > 1 && (
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
    color: '#fff',
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
