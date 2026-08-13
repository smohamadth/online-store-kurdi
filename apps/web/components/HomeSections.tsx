'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useIsMobile } from '@/lib/hooks';

/* ------------------------------------------------------------------ */
/* Trust bar - the strip of guarantees under the hero                  */
/* ------------------------------------------------------------------ */

export function TrustBar() {
  const isMobile = useIsMobile();
  const items = [
    { icon: '🚚', title: 'Free shipping', text: 'On orders over 50' },
    { icon: '↩️', title: '30-day returns', text: 'Hassle-free refunds' },
    { icon: '🔒', title: 'Secure checkout', text: 'Encrypted payments' },
    { icon: '💬', title: '24/7 support', text: 'We reply within hours' },
  ];

  return (
    <section style={{ borderBottom: '1px solid #ededed', backgroundColor: '#fff' }}>
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: isMobile ? '20px' : '26px 20px',
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isMobile ? '18px' : '24px',
        }}
      >
        {items.map((i) => (
          <div key={i.title} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '26px', lineHeight: 1 }} aria-hidden="true">
              {i.icon}
            </span>
            <div>
              <p style={{ fontWeight: 700, fontSize: '14px' }}>{i.title}</p>
              <p style={{ fontSize: '13px', color: '#777', marginTop: '2px' }}>{i.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Countdown deal banner                                               */
/* ------------------------------------------------------------------ */

export function DealCountdown() {
  const isMobile = useIsMobile();
  // `left` stays null until after mount. Computing a clock value during the
  // initial render makes the server HTML differ from the client's first render,
  // which React reports as a hydration mismatch (#418/#425).
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const endOfDay = () => {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    };
    const tick = () => setLeft(Math.max(0, endOfDay() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const clamped = left ?? 0;
  const hours = Math.floor(clamped / 3_600_000);
  const mins = Math.floor((clamped % 3_600_000) / 60_000);
  const secs = Math.floor((clamped % 60_000) / 1000);
  // Render an em dash pre-hydration so the markup is deterministic.
  const pad = (n: number) => (left === null ? '--' : String(n).padStart(2, '0'));

  return (
    <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px 0' }}>
      <div
        style={{
          borderRadius: '16px',
          padding: isMobile ? '28px 22px' : '40px',
          background: 'linear-gradient(120deg, #111827 0%, #1f2937 55%, #374151 100%)',
          color: '#fff',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: '24px',
        }}
      >
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '5px 12px',
              borderRadius: '999px',
              backgroundColor: 'rgba(239,68,68,0.9)',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Deal of the day
          </span>
          <h2 style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: 800, marginTop: '14px', letterSpacing: '-0.01em' }}>
            Save big before midnight
          </h2>
          <p style={{ marginTop: '8px', color: '#d1d5db', fontSize: '15px', maxWidth: '460px' }}>
            Limited quantities on selected items. New deals drop every morning.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '16px' : '24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '10px' }} aria-label="Time remaining">
            {[
              { v: pad(hours), l: 'Hours' },
              { v: pad(mins), l: 'Mins' },
              { v: pad(secs), l: 'Secs' },
            ].map((b) => (
              <div
                key={b.l}
                style={{
                  minWidth: '64px',
                  textAlign: 'center',
                  padding: '12px 8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{b.v}</div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>{b.l}</div>
              </div>
            ))}
          </div>
          <Link
            href="/deals"
            style={{
              padding: '14px 26px',
              backgroundColor: 'var(--card-bg, #fff)',
              color: '#111',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '15px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Shop deals
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Testimonials                                                        */
/* ------------------------------------------------------------------ */

export function Testimonials() {
  const isMobile = useIsMobile();
  const reviews = [
    {
      name: 'Sarah M.',
      role: 'Verified buyer',
      text: 'Ordered on a Monday and it arrived Wednesday. Packaging was spotless and the quality is better than I expected.',
      rating: 5,
    },
    {
      name: 'Daniel K.',
      role: 'Verified buyer',
      text: 'Had a sizing question and support answered within the hour. The return process was genuinely painless.',
      rating: 5,
    },
    {
      name: 'Ava R.',
      role: 'Verified buyer',
      text: 'Great prices without the sketchy feeling you get on marketplaces. This is my third order this year.',
      rating: 4,
    },
  ];

  return (
    <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px 0' }}>
      <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto' }}>
        <h2 style={{ fontSize: isMobile ? '22px' : '30px', fontWeight: 800, letterSpacing: '-0.01em' }}>
          Loved by our customers
        </h2>
        <p style={{ marginTop: '10px', color: '#666', fontSize: '15px' }}>
          Real feedback from people who shop with us.
        </p>
      </div>

      <div
        style={{
          marginTop: '32px',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: '20px',
        }}
      >
        {reviews.map((r) => (
          <figure
            key={r.name}
            style={{
              border: '1px solid #ededed',
              borderRadius: '12px',
              padding: '24px',
              backgroundColor: 'var(--card-bg, #fff)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ color: '#f59e0b', letterSpacing: '2px', fontSize: '15px' }}>
              {'★'.repeat(r.rating)}
              <span style={{ color: '#e0e0e0' }}>{'★'.repeat(5 - r.rating)}</span>
            </div>
            <blockquote style={{ fontSize: '15px', lineHeight: 1.65, color: '#333', flex: 1 }}>
              “{r.text}”
            </blockquote>
            <figcaption style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: '#111',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                }}
                aria-hidden="true"
              >
                {r.name.charAt(0)}
              </span>
              <span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '14px' }}>{r.name}</span>
                <span style={{ display: 'block', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
                  ✓ {r.role}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Animated stats strip                                                */
/* ------------------------------------------------------------------ */

function useCountUp(target: number, run: boolean, ms = 1400) {
  // Default to the final value: if the animation never runs the numbers are
  // still correct, rather than a misleading row of zeros.
  const [n, setN] = useState(target);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(target);
      return;
    }
    setN(0);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      // ease-out so the number decelerates into place
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return n;
}

export function StatsStrip() {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const customers = useCountUp(12500, visible);
  const orders = useCountUp(48000, visible);
  const rating = useCountUp(49, visible);
  const countries = useCountUp(32, visible);

  const stats = [
    { value: `${customers.toLocaleString()}+`, label: 'Happy customers' },
    { value: `${orders.toLocaleString()}+`, label: 'Orders delivered' },
    { value: `${(rating / 10).toFixed(1)}/5`, label: 'Average rating' },
    { value: `${countries}`, label: 'Countries served' },
  ];

  return (
    <section ref={ref} style={{ marginTop: '64px', backgroundColor: '#111', color: '#fff' }}>
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: isMobile ? '36px 20px' : '52px 20px',
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isMobile ? '28px' : '24px',
          textAlign: 'center',
        }}
      >
        {stats.map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: isMobile ? '26px' : '38px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {s.value}
            </div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#9ca3af', letterSpacing: '0.03em' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
