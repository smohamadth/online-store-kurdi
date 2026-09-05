/**
 * Theme Studio preview bag: sample merch + CSS vars that match the storefront.
 *
 * LayoutRenderer used to get `data={{}}` and `--primary`/`--bg`/`--text`,
 * while the live store reads `--brand`/`--body-bg`/`--body-text`. The preview
 * therefore looked empty and the wrong colour.
 */
import {
  PREVIEW_CATEGORIES,
  PREVIEW_PRODUCTS,
  PREVIEW_STORE,
} from '@/lib/previewSampleData';
import type { LayoutData } from './render';

export function studioLayoutData(): LayoutData {
  return {
    title: PREVIEW_STORE.name,
    subtitle: PREVIEW_STORE.description,
    products: PREVIEW_PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      image: `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="${p.accent}" width="200" height="200"/></svg>`,
      )}`,
    })),
    categories: PREVIEW_CATEGORIES.map((c) => ({
      name: c.name,
      slug: c.slug,
      count: c.count,
      emoji: '📦',
    })),
    banners: [{ title: PREVIEW_STORE.name, subtitle: PREVIEW_STORE.description }],
  };
}

/** Inline style vars for the studio canvas/preview (storefront names + aliases). */
export function studioTokenStyle(
  tokens: Record<string, string | number | boolean>,
): Record<string, string> {
  const t = tokens;
  const vars: Record<string, string> = {};
  const set = (name: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    vars[name] = String(value);
  };
  const primary = t.primaryColor;
  const bodyBg = t.bodyBg;
  const bodyText = t.bodyText;
  set('--brand', primary);
  set('--primary', primary);
  set('--accent', t.accentColor);
  set('--body-bg', bodyBg);
  set('--bg', bodyBg);
  set('--card-bg', t.cardBg);
  set('--body-text', bodyText);
  set('--text', bodyText);
  set('--muted', t.mutedText);
  set('--border', t.borderColor);
  if (t.radius !== undefined && t.radius !== null) {
    vars['--radius'] = `${t.radius}px`;
  }
  if (t.buttonRadius !== undefined && t.buttonRadius !== null) {
    vars['--btn-radius'] = `${t.buttonRadius}px`;
  }
  if (t.containerWidth !== undefined && t.containerWidth !== null) {
    vars['--container'] = `${t.containerWidth}px`;
  }
  if (t.headingWeight !== undefined && t.headingWeight !== null) {
    vars['--heading-weight'] = String(t.headingWeight);
  }
  if (t.baseFontSize !== undefined && t.baseFontSize !== null) {
    vars['--font-size'] = `${t.baseFontSize}px`;
  }
  const shadows: Record<string, string> = {
    none: 'none',
    soft: '0 1px 3px rgba(0,0,0,0.06)',
    strong: '0 10px 30px rgba(0,0,0,0.12)',
  };
  const shadow = shadows[String(t.cardShadow || 'soft')] || shadows.soft;
  vars['--shadow'] = shadow;
  if (t.cardBg) vars['--surface-2'] = String(t.cardBg);
  return vars;
}
