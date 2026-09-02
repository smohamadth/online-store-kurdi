'use client';

/**
 * Home page building blocks.
 *
 * Two things changed in the overhaul:
 *
 * 1. Every block now takes its copy from props (fed by the `HomeSection` rows
 *    in the database) instead of hardcoding strings. Nothing here needs a code
 *    change to re-word the home page.
 * 2. Colours come from the theme CSS variables (`--card-bg`, `--body-text`,
 *    `--muted`, `--border`, ...). Before this, sections hardcoded #fff / #111 /
 *    #666, so picking the Midnight preset produced white cards with white text
 *    on a dark page — the theme only reached part of the storefront.
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useIsMobile } from '@/lib/hooks';
import type { TrustItem, TestimonialItem, StatItem } from '@/lib/homeSections';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const CONTAINER = 'var(--container, 1200px)';

export function SectionHeading({
  title,
  subtitle,
  linkText,
  linkHref,
  center = false,
}: {
  title?: string | null;
  subtitle?: string | null;
  linkText?: string;
  linkHref?: string;
  center?: boolean;
}) {
  const isMobile = useIsMobile();
  if (!title && !subtitle) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: center ? 'center' : 'flex-end',
        justifyContent: center ? 'center' : 'space-between',
        flexDirection: center ? 'column' : 'row',
        // Logical alignment: in an RTL document the heading block sits at
        // the inline start (right) and its lines align to the right edge.
        textAlign: center ? 'center' : 'start',
        gap: '16px',
      }}
    >
      <div style={center ? { maxWidth: '620px' } : undefined}>
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

      {linkText && linkHref && !center && (
        <Link
          href={linkHref}
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--accent, #111)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {linkText}
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trust bar                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_TRUST: TrustItem[] = [
  { icon: '🚚', title: 'Free shipping', text: 'On orders over 50' },
  { icon: '↩️', title: '30-day returns', text: 'Hassle-free refunds' },
  { icon: '🔒', title: 'Secure checkout', text: 'Encrypted payments' },
  { icon: '💬', title: '24/7 support', text: 'We reply within hours' },
];

export function TrustBar({ items }: { items?: TrustItem[] }) {
  const isMobile = useIsMobile();
  const list = items?.length ? items : DEFAULT_TRUST;

  return (
    <section
      style={{
        borderBottom: '1px solid var(--border, #ededed)',
        backgroundColor: 'var(--card-bg, #fff)',
      }}
    >
      <div
        style={{
          maxWidth: CONTAINER,
          margin: '0 auto',
          padding: isMobile ? '20px' : '26px 20px',
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${Math.min(list.length, 4)}, 1fr)`,
          gap: isMobile ? '18px' : '24px',
        }}
      >
        {list.map((i, idx) => (
          <div key={`${i.title}-${idx}`} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '26px', lineHeight: 1 }} aria-hidden="true">
              {i.icon}
            </span>
            <div>
              <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--body-text, #111)' }}>
                {i.title}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--muted, #777)', marginTop: '2px' }}>
                {i.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Feature icons (the circular icon row)                               */
/* ------------------------------------------------------------------ */

export function FeatureIcons({ items }: { items?: TrustItem[] }) {
  const isMobile = useIsMobile();
  const list = items?.length ? items : DEFAULT_TRUST;

  return (
    <section style={{ backgroundColor: 'var(--card-bg, #f9f9f9)', marginTop: '64px' }}>
      <div
        style={{
          maxWidth: CONTAINER,
          margin: '0 auto',
          padding: '64px 20px',
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${Math.min(list.length, 4)}, 1fr)`,
          gap: '32px',
        }}
      >
        {list.map((f, idx) => (
          <div key={`${f.title}-${idx}`} style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: 'var(--body-bg, #f0f0f0)',
                border: '1px solid var(--border, #eee)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}
              aria-hidden="true"
            >
              {f.icon}
            </div>
            <h3 style={{ marginTop: '16px', fontWeight: 600, color: 'var(--body-text, #111)' }}>
              {f.title}
            </h3>
            <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--muted, #666)' }}>{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Countdown deal banner                                               */
/* ------------------------------------------------------------------ */

export function DealCountdown({
  title = 'Save big before midnight',
  subtitle = 'Limited quantities on selected items. New deals drop every morning.',
  badge = 'Deal of the day',
  buttonText = 'Shop deals',
  buttonHref = '/deals',
  gradientFrom = '#111827',
  gradientTo = '#374151',
}: {
  title?: string | null;
  subtitle?: string | null;
  badge?: string;
  buttonText?: string;
  buttonHref?: string;
  gradientFrom?: string;
  gradientTo?: string;
}) {
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
  const pad = (n: number) => (left === null ? '--' : String(n).padStart(2, '0'));

  return (
    <section style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '56px 20px 0' }}>
      <div
        style={{
          borderRadius: 'var(--radius, 16px)',
          padding: isMobile ? '28px 22px' : '40px',
          background: `linear-gradient(120deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
          // The gradient is admin-chosen (dark by default) - literal white is
          // the only pairing that is safe for ANY gradient and ANY preset.
          color: '#fff',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: '24px',
        }}
      >
        <div>
          {badge && (
            <span
              style={{
                display: 'inline-block',
                padding: '5px 12px',
                borderRadius: '999px',
                backgroundColor: 'var(--sale, rgba(239,68,68,0.9))',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {badge}
            </span>
          )}
          {title && (
            <h2
              style={{
                fontSize: isMobile ? '24px' : '32px',
                fontWeight: 800,
                marginTop: '14px',
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ marginTop: '8px', color: '#d1d5db', fontSize: '15px', maxWidth: '460px' }}>
              {subtitle}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '16px' : '24px',
            flexWrap: 'wrap',
          }}
        >
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
                <div style={{ fontSize: '24px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  {b.v}
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>{b.l}</div>
              </div>
            ))}
          </div>
          {buttonText && (
            <Link
              href={buttonHref || '/deals'}
              style={{
                padding: '14px 26px',
                backgroundColor: 'var(--brand, #fff)',
                color: 'var(--brand-text, #111)',
                borderRadius: 'var(--btn-radius, 8px)',
                fontWeight: 700,
                fontSize: '15px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {buttonText}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Testimonials                                                        */
/* ------------------------------------------------------------------ */

export function Testimonials({
  title = 'Loved by our customers',
  subtitle = 'Real feedback from people who shop with us.',
  items,
}: {
  title?: string | null;
  subtitle?: string | null;
  items?: TestimonialItem[];
}) {
  const isMobile = useIsMobile();
  const list = items?.length ? items : [];
  if (!list.length) return null;

  return (
    <section style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '64px 20px 0' }}>
      <SectionHeading title={title} subtitle={subtitle} center />

      <div
        style={{
          marginTop: '32px',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(list.length, 3)}, 1fr)`,
          gap: '20px',
        }}
      >
        {list.map((r, idx) => {
          const rating = Math.max(0, Math.min(5, Number(r.rating) || 0));
          return (
            <figure
              key={`${r.name}-${idx}`}
              style={{
                border: '1px solid var(--border, #ededed)',
                borderRadius: 'var(--radius, 12px)',
                padding: '24px',
                backgroundColor: 'var(--card-bg, #fff)',
                boxShadow: 'var(--shadow, none)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ color: 'var(--warning, #d97706)', letterSpacing: '2px', fontSize: '15px' }}>
                {'★'.repeat(rating)}
                <span style={{ color: 'currentColor', opacity: 0.28 }}>{'★'.repeat(5 - rating)}</span>
              </div>
              <blockquote
                style={{ fontSize: '15px', lineHeight: 1.65, color: 'var(--body-text, #333)', flex: 1 }}
              >
                “{r.text}”
              </blockquote>
              <figcaption style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--brand, #111)',
                    color: 'var(--brand-text, #fff)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}
                  aria-hidden="true"
                >
                  {r.name?.charAt(0) || '?'}
                </span>
                <span>
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 700,
                      fontSize: '14px',
                      color: 'var(--body-text, #111)',
                    }}
                  >
                    {r.name}
                  </span>
                  {r.role && (
                    <span
                      style={{ display: 'block', fontSize: '12px', color: 'var(--success, #16a34a)', fontWeight: 600 }}
                    >
                      ✓ {r.role}
                    </span>
                  )}
                </span>
              </figcaption>
            </figure>
          );
        })}
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
      setN(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return n;
}

function Stat({ item, run }: { item: StatItem; run: boolean }) {
  const isMobile = useIsMobile();
  const target = Number(item.value);
  const numeric = Number.isFinite(target);
  // Keep the admin's precision: "4.9" must not animate to "5".
  const decimals = numeric && String(item.value).includes('.')
    ? String(item.value).split('.')[1].length
    : 0;
  const n = useCountUp(numeric ? target : 0, run && numeric);

  const shown = numeric
    ? n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : item.value;

  return (
    <div>
      <div
        style={{
          fontSize: isMobile ? '26px' : '38px',
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {shown}
        {item.suffix || ''}
      </div>
      <div style={{ marginTop: '6px', fontSize: '13px', color: '#9ca3af', letterSpacing: '0.03em' }}>
        {item.label}
      </div>
    </div>
  );
}

export function StatsStrip({ items }: { items?: StatItem[] }) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const list = items?.length ? items : [];

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

  if (!list.length) return null;

  return (
    <section
      ref={ref}
      style={{ marginTop: '64px', backgroundColor: 'var(--brand, #111)', color: 'var(--brand-text, #fff)' }}
    >
      <div
        style={{
          maxWidth: CONTAINER,
          margin: '0 auto',
          padding: isMobile ? '36px 20px' : '52px 20px',
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${Math.min(list.length, 4)}, 1fr)`,
          gap: isMobile ? '28px' : '24px',
          textAlign: 'center',
        }}
      >
        {list.map((s, i) => (
          <Stat key={`${s.label}-${i}`} item={s} run={visible} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Rich text block - free-form admin content                           */
/* ------------------------------------------------------------------ */

export function RichTextBlock({
  title,
  subtitle,
  html,
  align = 'left',
}: {
  title?: string | null;
  subtitle?: string | null;
  html?: string;
  align?: 'left' | 'center';
}) {
  if (!title && !subtitle && !html) return null;
  return (
    <section style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '56px 20px 0' }}>
      <SectionHeading title={title} subtitle={subtitle} center={align === 'center'} />
      {html && (
        <div
          style={{
            marginTop: title || subtitle ? '20px' : 0,
            color: 'var(--body-text, #333)',
            lineHeight: 1.75,
            fontSize: '15px',
            // The stored "left" is a logical intent: mirror to the reading
            // start in RTL documents.
            textAlign: align === 'center' ? 'center' : 'start',
          }}
          // Sanitised server-side before it is stored; see home.routes.ts and
          // the shared sanitiser used by the rich text editor.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Newsletter                                                          */
/* ------------------------------------------------------------------ */

export function Newsletter({
  title = 'Subscribe to Our Newsletter',
  subtitle = 'Get the latest updates on new products, sales, and exclusive offers.',
  buttonText = 'Subscribe',
  placeholder = 'Enter your email',
  onSubmit,
  status,
  message,
}: {
  title?: string | null;
  subtitle?: string | null;
  buttonText?: string;
  placeholder?: string;
  onSubmit: (email: string) => void;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}) {
  const isMobile = useIsMobile();
  const [email, setEmail] = useState('');

  return (
    <section style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '64px 20px' }}>
      <div
        style={{
          borderRadius: 'var(--radius, 16px)',
          backgroundColor: 'var(--brand, #000)',
          color: 'var(--brand-text, #fff)',
          padding: isMobile ? '32px 22px' : '48px',
        }}
      >
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          {title && (
            <h2 style={{ fontSize: isMobile ? '22px' : '30px', fontWeight: 'bold' }}>{title}</h2>
          )}
          {subtitle && (
            <p style={{ marginTop: '16px', fontSize: '18px', opacity: 0.9 }}>{subtitle}</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email) onSubmit(email);
            }}
            style={{
              marginTop: '32px',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: '16px',
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholder}
              required
              aria-label="Email address"
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 'var(--btn-radius, 6px)',
                border: '1px solid rgba(255,255,255,0.25)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: 'var(--brand-text, #fff)',
                fontSize: '16px',
              }}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              style={{
                padding: '12px 24px',
                backgroundColor: status === 'loading' ? '#9ca3af' : 'var(--brand-text, #fff)',
                color: 'var(--brand, #000)',
                border: 'none',
                borderRadius: 'var(--btn-radius, 6px)',
                fontSize: '16px',
                fontWeight: 600,
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              }}
            >
              {status === 'loading' ? 'Subscribing...' : buttonText}
            </button>
          </form>
          {message && (
            <p
              style={{
                marginTop: '16px',
                fontSize: '14px',
                color: status === 'success' ? '#22c55e' : '#fca5a5',
              }}
            >
              {status === 'success' ? '✓ ' : '✕ '}
              {message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Custom section (admin-designed)                                     */
/* ------------------------------------------------------------------ */

/**
 * A fully styleable section the admin designs from Appearance → Home
 * (home section type `custom`) or inside the page/post block editors
 * (page block type `custom` - components/PageBlocks.tsx renders the
 * same component). The admin controls background, alignment, padding
 * and content width; `html` is rich text sanitised server-side before
 * it is stored (home.routes.ts scrubConfig / contentBlocks.ts).
 */
// Exported (not private) so the palette is unit tested in
// components/PageBlocks.test.tsx - a typo here would silently ship an
// unreadable section (white text on a white band) that only shows up in
// a browser.
export const CUSTOM_BACKGROUNDS: Record<string, { bg: string; text: string; heading: string }> = {
  none: { bg: 'transparent', text: 'var(--body-text, #111)', heading: 'var(--body-text, #111)' },
  soft: { bg: 'var(--surface-2, #f5f5f7)', text: 'var(--body-text, #111)', heading: 'var(--body-text, #111)' },
  brand: { bg: 'var(--brand, #111)', text: 'var(--brand-text, #fff)', heading: 'var(--brand-text, #fff)' },
  dark: { bg: '#111827', text: '#e5e7eb', heading: '#ffffff' },
};

const CUSTOM_PADDING: Record<string, string> = {
  none: '0 20px',
  small: '28px 20px',
  large: '56px 20px',
};

export function CustomSection({
  title,
  html,
  background = 'soft',
  align = 'left',
  padding = 'large',
  width = 'centered',
}: {
  title?: string | null;
  html?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
  padding?: 'none' | 'small' | 'large';
  width?: 'full' | 'centered';
}) {
  if (!title && !html) return null;
  const palette = CUSTOM_BACKGROUNDS[background] || CUSTOM_BACKGROUNDS.soft;
  // Logical alignment (start/center/end) so "left"/"right" mirror in RTL,
  // per the rtl-physical-ratchet convention.
  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'end' : 'start';
  return (
    <section
      style={{
        background: palette.bg,
        padding: CUSTOM_PADDING[padding] ?? CUSTOM_PADDING.large,
      }}
    >
      <div
        style={{
          maxWidth: width === 'full' ? 'none' : '860px',
          margin: '0 auto',
          textAlign,
          color: palette.text,
        }}
      >
        {title && (
          <h2
            style={{
              margin: '0 0 14px',
              fontSize: '26px',
              fontWeight: 'var(--heading-weight, 800)',
              color: palette.heading,
            }}
          >
            {title}
          </h2>
        )}
        {html && (
          <div
            style={{ lineHeight: 1.75, fontSize: '15px' }}
            // Sanitised server-side before it is stored; see
            // home.routes.ts and utils/contentBlocks.ts on the API.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </section>
  );
}
