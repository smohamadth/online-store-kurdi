/**
 * Home-page renderers for Studio-parity blocks (cta / steps / pricing).
 * Not seeded on the default theme — admins add them from Appearance → Home.
 */
import Link from 'next/link';
import { SectionHeading } from '@/components/HomeSections';

const CONTAINER = 'var(--container, 1200px)';

export function CtaBand({
  title,
  subtitle,
  buttonText,
  buttonHref,
  background,
}: {
  title?: string | null;
  subtitle?: string | null;
  buttonText?: string;
  buttonHref?: string;
  background?: string;
}) {
  const href = buttonHref || '/products';
  const label = buttonText || 'Shop now';
  return (
    <section
      data-section="cta"
      style={{
        maxWidth: CONTAINER,
        margin: '0 auto',
        padding: '24px 20px',
      }}
    >
      <div
        style={{
          background: background || 'var(--brand, #111)',
          color: 'var(--brand-text, #fff)',
          borderRadius: 'var(--radius, 12px)',
          padding: '40px 28px',
          textAlign: 'center',
        }}
      >
        {title && <h2 style={{ margin: 0, fontSize: 28 }}>{title}</h2>}
        {subtitle && <p style={{ opacity: 0.9, marginTop: 8, fontSize: 16 }}>{subtitle}</p>}
        <Link
          href={href}
          style={{
            display: 'inline-block',
            marginTop: 18,
            padding: '12px 24px',
            background: '#fff',
            color: '#111',
            borderRadius: 'var(--radius, 8px)',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {label}
        </Link>
      </div>
    </section>
  );
}

export function StepsBand({
  title,
  subtitle,
  items,
}: {
  title?: string | null;
  subtitle?: string | null;
  items?: { title?: string; text?: string }[];
}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  return (
    <section data-section="steps" style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '64px 20px' }}>
      <SectionHeading title={title} subtitle={subtitle} center />
      <div
        style={{
          marginTop: title || subtitle ? 36 : 0,
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 180px), 1fr))`,
          gap: 16,
        }}
      >
        {list.map((it, i) => (
          <div key={i} style={{ textAlign: 'center', padding: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--brand, #111)',
                color: 'var(--brand-text, #fff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                margin: '0 auto 10px',
              }}
            >
              {i + 1}
            </div>
            {it.title && <div style={{ fontWeight: 700 }}>{it.title}</div>}
            {it.text && (
              <div style={{ color: 'var(--muted, #666)', fontSize: 14, marginTop: 4 }}>{it.text}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function PricingBand({
  title,
  subtitle,
  items,
}: {
  title?: string | null;
  subtitle?: string | null;
  items?: {
    name?: string;
    price?: string;
    period?: string;
    features?: string[];
    buttonText?: string;
    buttonHref?: string;
    highlighted?: boolean;
  }[];
}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  return (
    <section data-section="pricing" style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '64px 20px' }}>
      <SectionHeading title={title} subtitle={subtitle} center />
      <div
        style={{
          marginTop: title || subtitle ? 36 : 0,
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 220px), 1fr))`,
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        {list.map((tier, i) => (
          <div
            key={i}
            style={{
              border: `2px solid ${tier.highlighted ? 'var(--brand, #111)' : 'var(--border, #e5e5e5)'}`,
              borderRadius: 'var(--radius, 12px)',
              padding: 24,
              background: 'var(--card-bg, #fff)',
            }}
          >
            <div style={{ fontWeight: 700 }}>{tier.name}</div>
            <div style={{ fontSize: 28, fontWeight: 800, margin: '10px 0 2px' }}>
              {tier.price}
              {tier.period ? ` / ${tier.period}` : ''}
            </div>
            <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', fontSize: 14, color: 'var(--muted, #666)' }}>
              {(Array.isArray(tier.features) ? tier.features : []).map((f, j) => (
                <li key={j} style={{ padding: '4px 0' }}>
                  ✓ {f}
                </li>
              ))}
            </ul>
            {tier.buttonText && (
              <Link
                href={tier.buttonHref || '/products'}
                style={{
                  display: 'block',
                  marginTop: 16,
                  padding: '10px 0',
                  textAlign: 'center',
                  borderRadius: 'var(--radius, 8px)',
                  background: tier.highlighted ? 'var(--brand, #111)' : 'transparent',
                  color: tier.highlighted ? 'var(--brand-text, #fff)' : 'var(--body-text, #111)',
                  border: tier.highlighted ? 'none' : '1px solid var(--border, #e5e5e5)',
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                {tier.buttonText}
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
