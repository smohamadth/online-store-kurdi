'use client';

// ---------------------------------------------------------------------------
// LayoutRenderer — draws a PageLayout as a CSS grid of block components.
//
// This is the storefront side of the theme builder: whatever layout an admin
// builds in /admin/theme-studio, this component renders it. It is
// presentational — the actual product/category data comes from props the page
// passes in (a page renderer already has that data loaded).
//
// Each block maps to a storefront component via BLOCK_RENDERERS. Unknown block
// types are skipped (never crash the page). A page passes a `data` bag so the
// same renderer can drive the homepage, a listing, a product detail, etc.
// ---------------------------------------------------------------------------

import { ReactNode, CSSProperties } from 'react';
import { PageLayout, LayoutBlock } from './types';
import { toEmbedUrl, itemsOf } from './blockUtils';

/** Data a page hands to a block so it can render real content. */
export interface LayoutData {
  banners?: any[];
  products?: any[];
  categories?: any[];
  title?: string | null;
  subtitle?: string | null;
  [key: string]: unknown;
}

/** A block renderer receives its config merged over the page data. */
export type BlockRenderer = (block: LayoutBlock, data: LayoutData) => ReactNode;

/**
 * Build a responsive `gridTemplateColumns` value for a multi-column block.
 *
 * Uses `auto-fit` + `minmax(min(100%, MINpx), 1fr)` so the grid shows up to
 * `perRow` columns on a wide cell and reflows down to a single column on a
 * narrow (phone) cell — no separate media query needed, and it matches the
 * shipped themes (see bold/sections/Featured.tsx). `container` is the design
 * width at which all `perRow` columns fit side by side; MIN is derived from it
 * minus the gutters.
 */
export function responsiveGrid(perRow: number, gap = 16, container = 1280): string {
  const cols = Math.max(1, Math.min(12, Math.round(perRow) || 4));
  const min = Math.max(120, Math.floor((container - gap * (cols - 1)) / cols));
  return `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`;
}

/** A shared product-grid renderer used by newArrivals / trending. */
function productGrid(b: LayoutBlock, d: LayoutData, fallbackTitle: string) {
  const items = (d.products ?? []) as any[];
  const title = String(b.config.title ?? '') || fallbackTitle;
  const shown = items.slice(0, Number(b.config.limit ?? 8) || 8);
  if (!shown.length) return <div style={{ color: 'var(--muted)' }}>{title} — add products.</div>;
  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>{title}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Number(b.config.perRow ?? 4) || 4), gap: 16 }}>
        {shown.map((p) => (
          <div key={p.id} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Map block type -> a small presentational renderer. */
const BLOCK_RENDERERS: Record<string, BlockRenderer> = {
  hero: (b, d) => (
    <div>
      <h2 style={{ margin: 0 }}>{String(b.config.title ?? d.title ?? '')}</h2>
      {String(b.config.subtitle ?? '') && <p style={{ color: 'var(--muted)', marginTop: 6 }}>{String(b.config.subtitle)}</p>}
    </div>
  ),
  richText: (b) => {
    const html = b.config.html ?? b.config.text ?? '';
    if (!html) return null;
    // Config html is sanitised on write (see theme studio / home sections).
    return <div dangerouslySetInnerHTML={{ __html: String(html) }} />;
  },
  custom: (b) => {
    const html = b.config.html;
    if (html) return <div dangerouslySetInnerHTML={{ __html: String(html) }} />;
    return <div>{String(b.config.title ?? 'Custom block')}</div>;
  },
  newsletter: () => <div style={{ padding: '20px', background: 'var(--surface-2, #f4f4f5)', borderRadius: 'var(--radius)' }}>Newsletter</div>,
  stats: (b) => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {(Array.isArray(b.config.items) ? b.config.items : []).map((s: any, i: number) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{s?.value ?? ''}</div>
          <div style={{ color: 'var(--muted)' }}>{s?.label ?? ''}</div>
        </div>
      ))}
    </div>
  ),
  trustBar: (b) => (
    <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
      {(Array.isArray(b.config.items) ? b.config.items : []).map((t: any, i: number) => (
        <div key={i} style={{ color: 'var(--muted)' }}>{t?.text ?? ''}</div>
      ))}
    </div>
  ),
  categories: (b, d) => {
    const cats = (d.categories ?? []) as any[];
    if (!cats.length) return null;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Number(b.config.perRow ?? 4) || 4), gap: 16 }}>
        {cats.slice(0, Number(b.config.limit ?? 8) || 8).map((c) => (
          <div key={c.slug} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
            <div style={{ fontSize: 26 }}>{c.emoji ?? '📦'}</div>
            <div style={{ fontWeight: 600 }}>{c.name}</div>
          </div>
        ))}
      </div>
    );
  },
  featured: (b, d) => {
    const items = (d.products ?? []) as any[];
    if (!items.length) return null;
    return (
      <div>
        {(b.config.title || d.title) && (
          <h2 style={{ margin: '0 0 16px' }}>{String(b.config.title ?? d.title)}</h2>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Number(b.config.perRow ?? 4) || 4), gap: 16 }}>
          {items.slice(0, Number(b.config.limit ?? 8) || 8).map((p) => (
            <div key={p.id} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
            </div>
          ))}
        </div>
      </div>
    );
  },



  promo: (b) => (
    <div style={{ padding: 24, border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
      {String(b.config.title ?? '') && <h3 style={{ margin: 0 }}>{String(b.config.title)}</h3>}
      {String(b.config.subtitle ?? '') && <p style={{ color: 'var(--muted)', marginTop: 4 }}>{String(b.config.subtitle)}</p>}
      {String(b.config.image ?? '') && <img src={String(b.config.image)} alt="" style={{ width: '100%', marginTop: 12, borderRadius: 'var(--radius)' }} />}
    </div>
  ),
  bannerStrip: (b) => (
    <div style={{ padding: '18px 24px', background: b.config.background ? String(b.config.background) : 'var(--primary, #111)', color: '#fff', borderRadius: 'var(--radius)', textAlign: 'center', fontWeight: 700, fontSize: 16 }}>
      {String(b.config.title ?? '')}
    </div>
  ),
  features: (b) => {
    const items = itemsOf(b.config);
    if (!items.length) return <div style={{ color: 'var(--muted)' }}>Features go here.</div>;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Number(b.config.perRow ?? 3) || 3), gap: 16 }}>
        {items.map((it, i) => (
          <div key={i} style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28 }}>{String(it.icon ?? '✨')}</div>
            {String(it.title ?? '') && <div style={{ fontWeight: 700, marginTop: 6 }}>{String(it.title)}</div>}
            {String(it.text ?? '') && <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{String(it.text)}</div>}
          </div>
        ))}
      </div>
    );
  },
  newArrivals: (b, d) => productGrid(b, d, 'New Arrivals'),
  trending: (b, d) => productGrid(b, d, 'Trending Now'),
  dealCountdown: (b) => (
    <div style={{ padding: 32, background: 'linear-gradient(135deg, var(--primary, #111), var(--accent, #2563eb))', color: '#fff', borderRadius: 'var(--radius)', textAlign: 'center' }}>
      {String(b.config.title ?? '') && <h3 style={{ margin: 0 }}>{String(b.config.title)}</h3>}
      {String(b.config.subtitle ?? '') && <p style={{ opacity: 0.9, marginTop: 6 }}>{String(b.config.subtitle)}</p>}
      {String(b.config.buttonText ?? '') && (
        <div style={{ marginTop: 14, display: 'inline-block', padding: '10px 20px', background: '#fff', color: '#111', borderRadius: 'var(--radius)', fontWeight: 700 }}>
          {String(b.config.buttonText)}
        </div>
      )}
    </div>
  ),
  testimonials: (b) => {
    const items = itemsOf(b.config);
    if (!items.length) return <div style={{ color: 'var(--muted)' }}>Testimonials go here.</div>;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Math.min(items.length, 3)), gap: 16 }}>
        {items.map((t, i) => (
          <div key={i} style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2, #fafafa)' }}>
            <div>“{String(t.text ?? '')}”</div>
            {String(t.author ?? '') && <div style={{ fontWeight: 700, marginTop: 8 }}>{String(t.author)}</div>}
          </div>
        ))}
      </div>
    );
  },
  gallery: (b) => {
    const items = itemsOf(b.config).map((it) => String(it.src ?? it.url ?? '')).filter(Boolean);
    if (!items.length) return <div style={{ color: 'var(--muted)' }}>Gallery images go here.</div>;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Number(b.config.perRow ?? 3) || 3, 12), gap: 12 }}>
        {items.map((src, i) => (
          <img key={i} src={src} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 'var(--radius)' }} />
        ))}
      </div>
    );
  },

  // ---- Rich, pre-built content blocks. ----
  cta: (b) => {
    const bg = b.config.background ? String(b.config.background) : 'var(--primary, #111)';
    return (
      <div
        style={{
          background: bg,
          color: '#fff',
          borderRadius: 'var(--radius)',
          padding: 40,
          textAlign: b.config.align === 'left' ? 'left' : 'center',
        }}
      >
        {String(b.config.title ?? '') && <h2 style={{ margin: 0, fontSize: 28 }}>{String(b.config.title)}</h2>}
        {String(b.config.subtitle ?? '') && <p style={{ opacity: 0.9, marginTop: 8, fontSize: 16 }}>{String(b.config.subtitle)}</p>}
        {String(b.config.buttonText ?? '') && (
          <a
            href={String(b.config.buttonHref || '#')}
            style={{
              display: 'inline-block', marginTop: 18, padding: '12px 24px',
              background: '#fff', color: '#111', borderRadius: 'var(--radius)',
              fontWeight: 700, textDecoration: 'none',
            }}
          >
            {String(b.config.buttonText)}
          </a>
        )}
      </div>
    );
  },
  video: (b) => {
    const src = String(b.config.src ?? '');
    if (!src) return <div style={{ color: 'var(--muted)' }}>Add a video URL (YouTube / Vimeo / .mp4).</div>;
    const embed = toEmbedUrl(src);
    if (embed) {
      return (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <iframe src={embed} title={String(b.config.caption ?? '')} frameBorder="0" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        </div>
      );
    }
    return (
      <div>
        <video src={src} controls style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block' }} />
        {String(b.config.caption ?? '') && <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>{String(b.config.caption)}</p>}
      </div>
    );
  },
  image: (b) => {
    const src = String(b.config.src ?? '');
    if (!src) return <div style={{ padding: 40, border: '1px dashed var(--border)', borderRadius: 'var(--radius)', textAlign: 'center', color: 'var(--muted)' }}>Add an image URL.</div>;
    return (
      <div>
        <img src={src} alt={String(b.config.alt ?? '')} style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block', objectFit: 'cover' }} />
        {String(b.config.caption ?? '') && <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, textAlign: 'center' }}>{String(b.config.caption)}</p>}
      </div>
    );
  },
  textImage: (b) => {
    const img = String(b.config.image ?? '');
    const right = b.config.imageOnRight === 'right';
    const copy = (
      <div>
        {String(b.config.heading ?? '') && <h2 style={{ margin: 0 }}>{String(b.config.heading)}</h2>}
        {String(b.config.body ?? '') && <p style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>{String(b.config.body)}</p>}
      </div>
    );
    const media = img ? (
      <img src={img} alt="" style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block' }} />
    ) : (
      <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius)', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Image</div>
    );
    return (
      <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(2, 24, 768), gap: 24, alignItems: 'center' }}>
        {right ? (<>{copy}{media}</>) : (<>{media}{copy}</>)}
      </div>
    );
  },
  divider: () => <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />,
  faq: (b) => {
    const items = itemsOf(b.config);
    if (!items.length) return <div style={{ color: 'var(--muted)' }}>FAQ items go here.</div>;
    return (
      <div>
        {String(b.config.title ?? '') && <h2 style={{ margin: '0 0 16px' }}>{String(b.config.title)}</h2>}
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((it, i) => (
            <div key={i} style={{ padding: '16px 18px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontWeight: 700 }}>{String(it.q ?? it.question ?? '')}</div>
              {String(it.a ?? it.answer ?? '') && <div style={{ color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>{String(it.a ?? it.answer)}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  },
  steps: (b) => {
    const items = itemsOf(b.config);
    if (!items.length) return <div style={{ color: 'var(--muted)' }}>Steps go here.</div>;
    const cols = Math.min(Math.max(items.length, 1), 4);
    return (
      <div>
        {String(b.config.title ?? '') && <h2 style={{ margin: '0 0 16px' }}>{String(b.config.title)}</h2>}
        <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(cols), gap: 16 }}>
          {items.map((it, i) => (
            <div key={i} style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary, #111)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, margin: '0 auto 10px' }}>{i + 1}</div>
              {String(it.title ?? '') && <div style={{ fontWeight: 700 }}>{String(it.title)}</div>}
              {String(it.text ?? '') && <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{String(it.text)}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  },
  logoStrip: (b) => {
    const items = itemsOf(b.config);
    if (!items.length) return <div style={{ color: 'var(--muted)' }}>Brands / logos go here.</div>;
    return (
      <div>
        {String(b.config.title ?? '') && <div style={{ textAlign: 'center', fontWeight: 600, color: 'var(--muted)', marginBottom: 12 }}>{String(b.config.title)}</div>}
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', opacity: 0.7 }}>
          {items.map((it, i) => (
            <div key={i} style={{ fontWeight: 800, letterSpacing: '0.02em' }}>{String(it.name ?? it.text ?? '')}</div>
          ))}
        </div>
      </div>
    );
  },
  pricing: (b) => {
    const items = itemsOf(b.config);
    if (!items.length) return <div style={{ color: 'var(--muted)' }}>Pricing tiers go here.</div>;
    const cols = Math.min(Math.max(items.length, 1), 3);
    return (
      <div>
        {String(b.config.title ?? '') && <h2 style={{ margin: '0 0 20px', textAlign: 'center' }}>{String(b.config.title)}</h2>}
        <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(cols), gap: 16, alignItems: 'stretch' }}>
          {items.map((tier, i) => (
            <div key={i} style={{ border: `2px solid ${tier.highlighted ? 'var(--primary, #111)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: 24, background: 'var(--surface-2, #fafafa)' }}>
              <div style={{ fontWeight: 700 }}>{String(tier.name ?? '')}</div>
              <div style={{ fontSize: 28, fontWeight: 800, margin: '10px 0 2px' }}>
                {String(tier.price ?? '')}{String(tier.period ? ` / ${tier.period}` : '')}
              </div>
              <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', fontSize: 14, color: 'var(--muted)' }}>
                {(Array.isArray(tier.features) ? tier.features : []).map((f, j) => (
                  <li key={j} style={{ padding: '4px 0' }}>✓ {String(f)}</li>
                ))}
              </ul>
              {String(tier.buttonText ?? '') && (
                <div style={{ marginTop: 16, padding: '10px 0', textAlign: 'center', borderRadius: 'var(--radius)', background: tier.highlighted ? 'var(--primary, #111)' : 'transparent', color: tier.highlighted ? '#fff' : 'var(--text, #111)', border: tier.highlighted ? 'none' : '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                  {String(tier.buttonText)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  },
  quote: (b) => {
    if (!String(b.config.text ?? '')) return <div style={{ color: 'var(--muted)' }}>Add a quote.</div>;
    return (
      <figure style={{ margin: 0, padding: '28px 32px', textAlign: 'center' }}>
        <blockquote style={{ margin: 0, fontSize: 22, fontStyle: 'italic', lineHeight: 1.5, color: 'var(--text, #111)' }}>“{String(b.config.text)}”</blockquote>
        {String(b.config.author ?? '') && (
          <figcaption style={{ marginTop: 14, fontWeight: 700 }}>
            {String(b.config.author)}
            {String(b.config.role ?? '') && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> — {String(b.config.role)}</span>}
          </figcaption>
        )}
      </figure>
    );
  },
  iconsGrid: (b) => {
    const items = itemsOf(b.config);
    if (!items.length) return <div style={{ color: 'var(--muted)' }}>Icon tiles go here.</div>;
    const cols = Number(b.config.perRow ?? 4) || 4;
    return (
      <div>
        {String(b.config.title ?? '') && <h2 style={{ margin: '0 0 16px' }}>{String(b.config.title)}</h2>}
        <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(cols), gap: 16 }}>
          {items.map((it, i) => (
            <div key={i} style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: 30 }}>{String(it.icon ?? '✨')}</div>
              {String(it.title ?? '') && <div style={{ fontWeight: 700, marginTop: 8 }}>{String(it.title)}</div>}
              {String(it.text ?? '') && <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{String(it.text)}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  },

  // ---- Page-native blocks: render a page's core content from LayoutData. ----
  // These let a theme author place the real product grid, a product detail, a
  // blog list, etc. inside a layout grid. Each reads its content from the
  // `data` bag the page supplies (matching the page's own renderers).
  productList: (b, d) => {
    const items = (d.products ?? []) as any[];
    return (
      <div>
        {(b.config.title || d.title) && (
          <h2 style={{ margin: '0 0 16px' }}>{String(b.config.title ?? d.title)}</h2>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Number(b.config.perRow ?? 4) || 4), gap: 16 }}>
          {items.map((p) => (
            <div key={p.id} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ color: 'var(--muted)' }}>{p.price ? String(p.price) : ''}</div>
            </div>
          ))}
        </div>
      </div>
    );
  },
  categoryGrid: (b, d) => {
    const items = (d.products ?? []) as any[];
    return (
      <div>
        {(b.config.title || d.title) && <h2 style={{ margin: '0 0 16px' }}>{String(b.config.title ?? d.title)}</h2>}
        <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Number(b.config.perRow ?? 3) || 3), gap: 16 }}>
          {items.map((p) => (
            <div key={p.id} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
            </div>
          ))}
        </div>
      </div>
    );
  },
  productDetail: (b, d) => {
    const p = (d.product ?? null) as any;
    if (!p) return null;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(2, 24, 768), gap: 24, alignItems: 'start' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
          {(b.config.label ?? 'Product image') as any}
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>{p.name}</h1>
          {p.description && <p style={{ color: 'var(--muted)', marginTop: 8 }}>{p.description}</p>}
          {p.price && <div style={{ fontSize: 24, fontWeight: 800, marginTop: 12 }}>{String(p.price)}</div>}
          <div style={{ marginTop: 16, padding: '12px 20px', background: 'var(--primary, #111)', color: '#fff', borderRadius: 'var(--radius)', display: 'inline-block', fontWeight: 700 }}>
            Add to cart
          </div>
        </div>
      </div>
    );
  },
  blogList: (b, d) => {
    const posts = (d.posts ?? []) as any[];
    return (
      <div>
        {(b.config.title || d.title) && <h2 style={{ margin: '0 0 16px' }}>{String(b.config.title ?? d.title)}</h2>}
        <div style={{ display: 'grid', gridTemplateColumns: responsiveGrid(Number(b.config.perRow ?? 3) || 3), gap: 16 }}>
          {posts.map((post) => (
            <div key={post.slug ?? post.id} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontWeight: 600 }}>{post.title}</div>
              {post.excerpt && <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{post.excerpt}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  },
  blogPostBody: (b, d) => {
    const post = (d.post ?? null) as any;
    if (!post) return null;
    return (
      <article>
        <h1 style={{ margin: 0 }}>{post.title}</h1>
        {post.content && <div style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: String(post.content) }} />}
      </article>
    );
  },
  pageContent: (b, d) => {
    const html = (d.html as string) ?? (b.config.html as string) ?? '';
    if (!html) return <div>{String(b.config.title ?? '')}</div>;
    return <div dangerouslySetInnerHTML={{ __html: String(html) }} />;
  },
};

/**
 * Render a page layout as a grid. Blocks are sorted by (rowStart, colStart)
 * and positioned absolutely within a CSS grid so every block keeps its exact
 * cell — no gaps, no implicit rows.
 */
export function LayoutRenderer({ layout, data }: { layout: PageLayout; data: LayoutData }) {
  if (!layout || !Array.isArray(layout.blocks) || layout.blocks.length === 0) {
    return null;
  }
  const blocks = [...layout.blocks].sort((a, b) => a.rowStart - b.rowStart || a.colStart - b.colStart);
  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${layout.columns || 12}, 1fr)`,
    gap: layout.gap ?? 24,
    gridAutoFlow: 'dense',
  };
  return (
    <div className="builder-layout" style={gridStyle}>
      {blocks.map((block) => {
        const renderer = BLOCK_RENDERERS[block.type];
        if (!renderer) return null;
        const style: CSSProperties = {
          gridColumn: `${block.colStart} / span ${block.colSpan}`,
          gridRow: `${block.rowStart} / span ${block.rowSpan}`,
          minWidth: 0,
        };
        return (
          <div key={block.id} style={style} data-block-type={block.type}>
            {renderer(block, data)}
          </div>
        );
      })}
    </div>
  );
}
