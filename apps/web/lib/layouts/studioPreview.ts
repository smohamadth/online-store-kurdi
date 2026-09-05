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
import { FONT_STACKS } from '@/lib/theme';
import type { LayoutData } from './render';
import type { Product } from '@/lib/api';
import type { HomeCategoryTile } from '@/components/HomeSectionStack';
import type { Banner } from '@/components/HeroGallery';

function sampleSvg(accent: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="${accent}" width="200" height="200"/></svg>`,
  )}`;
}

export function studioLayoutData(): LayoutData {
  return {
    title: PREVIEW_STORE.name,
    subtitle: PREVIEW_STORE.description,
    products: PREVIEW_PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      image: sampleSvg(p.accent),
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

/** Product-shaped samples for HomeSectionStack (same cards as live home). */
export function studioHomeMerch(): {
  products: Product[];
  categories: HomeCategoryTile[];
  banners: Banner[];
} {
  const products: Product[] = PREVIEW_PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.imageAlt,
    shortDescription: p.imageAlt,
    sku: p.slug,
    type: 'physical',
    status: 'active',
    price: p.price,
    compareAtPrice: null,
    quantity: 10,
    images: [{ id: `${p.id}-img`, url: sampleSvg(p.accent), alt: p.imageAlt, isPrimary: true, sortOrder: 0 }],
    category: { id: p.category.slug, name: p.category.name, slug: p.category.slug, image: null },
    variants: [],
    averageRating: 4.5,
    reviewCount: 12,
    downloadUrl: null,
    downloadLimit: null,
    downloadExpiry: null,
    isFeatured: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  const categories: HomeCategoryTile[] = PREVIEW_CATEGORIES.map((c) => ({
    name: c.name,
    slug: c.slug,
    emoji: '📦',
    count: c.count,
  }));
  const banners: Banner[] = [
    {
      id: 'studio-hero-1',
      title: PREVIEW_STORE.name,
      subtitle: 'New season',
      description: PREVIEW_STORE.description,
      image: '',
      linkUrl: '/products',
      buttonText: 'Shop now',
      overlayColor: 'linear-gradient(120deg, #1a1a2e, #16213e)',
      textColor: '#ffffff',
      align: 'left',
    },
  ];
  return { products, categories, banners };
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
  set('--brand-text', t.primaryTextColor);
  set('--accent', t.accentColor);
  set('--body-bg', bodyBg);
  set('--bg', bodyBg);
  set('--card-bg', t.cardBg);
  set('--body-text', bodyText);
  set('--text', bodyText);
  set('--muted', t.mutedText);
  set('--border', t.borderColor);
  set('--header-bg', t.headerBg);
  set('--header-text', t.headerText);
  set('--footer-bg', t.footerBg);
  set('--footer-text', t.footerText);
  set('--price', t.priceColor);
  set('--sale', t.saleColor);
  const fontKey = String(t.fontFamily || 'system');
  vars['--font'] = FONT_STACKS[fontKey] || FONT_STACKS.system;
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

/** Live storefront path for the studio iframe, or null when the page has no public URL. */
export function studioLivePreviewPath(page: string, bust: number): string | null {
  if (page === 'home') return `/?homePreview=${bust}`;
  if (page === 'products') return `/products?studioPreview=${bust}`;
  if (page === 'blog') return `/blog?studioPreview=${bust}`;
  return null;
}
