'use client';

import { useEffect, useRef } from 'react';
import { htmlToText } from './RichTextEditor';

/**
 * SEO meta tags for a product.
 *
 * Fields auto-fill from the product name and description as the admin types,
 * and stop auto-filling the moment the admin edits one by hand. Product pages
 * previously served the generic site title and description to crawlers, so
 * every product looked identical to Google.
 */

export interface SeoValues {
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string[];
  slug: string;
}

interface Props {
  productName: string;
  descriptionHtml: string;
  categoryName?: string;
  storeName?: string;
  value: SeoValues;
  onChange: (v: SeoValues) => void;
}

const TITLE_MAX = 60;
const DESC_MAX = 160;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildMetaTitle(name: string, store?: string): string {
  const base = name.trim();
  if (!base) return '';
  const suffix = store ? ` | ${store}` : '';
  // Keep the store name only if the whole thing still fits Google's snippet.
  return (base + suffix).length <= TITLE_MAX ? base + suffix : base.slice(0, TITLE_MAX);
}

export function buildMetaDescription(html: string, name: string): string {
  const text = htmlToText(html || '') || name;
  if (text.length <= DESC_MAX) return text;
  // Cut on a word boundary so the snippet never ends mid-word.
  const cut = text.slice(0, DESC_MAX);
  return cut.slice(0, cut.lastIndexOf(' ')).trim() + '…';
}

export function buildKeywords(name: string, category?: string, html?: string): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'you', 'are',
    'our', 'has', 'have', 'will', 'can', 'all', 'new', 'get', 'its', 'was',
  ]);
  const words = `${name} ${category || ''} ${htmlToText(html || '')}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));

  // Plain object + Object.entries keeps this compatible with the project's
  // TS target (spreading a Map iterator needs downlevelIteration).
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;

  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);

  const seeds = [name.toLowerCase().trim(), category?.toLowerCase().trim()].filter(Boolean) as string[];
  const out: string[] = [];
  for (const k of seeds.concat(top)) {
    if (k && out.indexOf(k) === -1) out.push(k);
  }
  return out.slice(0, 10);
}

export default function SeoPanel({
  productName,
  descriptionHtml,
  categoryName,
  storeName,
  value,
  onChange,
}: Props) {
  // Once the admin edits a field by hand we must stop overwriting it.
  const touched = useRef({ title: false, desc: false, keywords: false, slug: false });

  useEffect(() => {
    if (!productName) return;
    const next = { ...value };
    let changed = false;

    if (!touched.current.title) {
      const t = buildMetaTitle(productName, storeName);
      if (t !== next.metaTitle) { next.metaTitle = t; changed = true; }
    }
    if (!touched.current.desc) {
      const d = buildMetaDescription(descriptionHtml, productName);
      if (d !== next.metaDescription) { next.metaDescription = d; changed = true; }
    }
    if (!touched.current.keywords) {
      const k = buildKeywords(productName, categoryName, descriptionHtml);
      if (k.join(',') !== next.metaKeywords.join(',')) { next.metaKeywords = k; changed = true; }
    }
    if (!touched.current.slug) {
      const s = slugify(productName);
      if (s !== next.slug) { next.slug = s; changed = true; }
    }

    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, descriptionHtml, categoryName, storeName]);

  const label: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '5px' };
  const input: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: '1px solid #d4d4d4', borderRadius: '6px', fontSize: '14px',
  };

  const counter = (len: number, max: number) => {
    const over = len > max;
    const low = len > 0 && len < max * 0.4;
    return (
      <span style={{ fontSize: '12px', color: over ? '#dc2626' : low ? '#d97706' : '#16a34a', fontWeight: 600 }}>
        {len}/{max}
        {over ? ' — too long, Google will truncate' : low ? ' — could be longer' : ' — good'}
      </span>
    );
  };

  const regenerate = () => {
    touched.current = { title: false, desc: false, keywords: false, slug: false };
    onChange({
      metaTitle: buildMetaTitle(productName, storeName),
      metaDescription: buildMetaDescription(descriptionHtml, productName),
      metaKeywords: buildKeywords(productName, categoryName, descriptionHtml),
      slug: slugify(productName),
    });
  };

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px', backgroundColor: '#fcfcfd' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <h3 style={{ fontWeight: 700, fontSize: '15px' }}>🔍 Search engine listing</h3>
        <button
          type="button"
          onClick={regenerate}
          style={{ padding: '6px 12px', border: '1px solid #d4d4d4', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
        >
          Regenerate from product
        </button>
      </div>
      <p style={{ fontSize: '12px', color: '#777', marginBottom: '14px' }}>
        Filled in automatically as you type. Edit any field to take manual control of it.
      </p>

      {/* Google-style preview */}
      <div style={{ border: '1px solid #e8e8e8', borderRadius: '8px', padding: '14px', background: '#fff', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: '#5f6368' }}>
          {(process.env.NEXT_PUBLIC_SITE_URL || 'https://yourstore.com').replace(/^https?:\/\//, '')} › products › {value.slug || 'product'}
        </div>
        <div style={{ color: '#1a0dab', fontSize: '19px', lineHeight: 1.3, marginTop: '2px' }}>
          {value.metaTitle || productName || 'Product title'}
        </div>
        <div style={{ color: '#4d5156', fontSize: '13px', lineHeight: 1.5, marginTop: '3px' }}>
          {value.metaDescription || 'Your product description will appear here in search results.'}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <label style={label}>Meta title</label>
            {counter(value.metaTitle.length, TITLE_MAX)}
          </div>
          <input
            type="text"
            value={value.metaTitle}
            onChange={(e) => { touched.current.title = true; onChange({ ...value, metaTitle: e.target.value }); }}
            style={input}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <label style={label}>Meta description</label>
            {counter(value.metaDescription.length, DESC_MAX)}
          </div>
          <textarea
            value={value.metaDescription}
            onChange={(e) => { touched.current.desc = true; onChange({ ...value, metaDescription: e.target.value }); }}
            style={{ ...input, minHeight: '72px', resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={label}>URL slug</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: '#888' }}>/products/</span>
            <input
              type="text"
              value={value.slug}
              onChange={(e) => { touched.current.slug = true; onChange({ ...value, slug: slugify(e.target.value) }); }}
              style={input}
            />
          </div>
        </div>

        <div>
          <label style={label}>Keywords</label>
          <input
            type="text"
            value={value.metaKeywords.join(', ')}
            onChange={(e) => {
              touched.current.keywords = true;
              onChange({ ...value, metaKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) });
            }}
            placeholder="comma, separated, keywords"
            style={input}
          />
          {value.metaKeywords.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
              {value.metaKeywords.map((k) => (
                <span key={k} style={{ fontSize: '12px', padding: '3px 9px', borderRadius: '999px', backgroundColor: '#eef2ff', color: '#3730a3', fontWeight: 600 }}>
                  {k}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
