import { describe, it, expect } from 'vitest';
import { studioLayoutData, studioTokenStyle, studioHomeMerch, studioLivePreviewPath } from './studioPreview';
import { PREVIEW_PRODUCTS, PREVIEW_CATEGORIES } from '@/lib/previewSampleData';

describe('studioLayoutData', () => {
  it('feeds products and categories so featured/category blocks are not empty', () => {
    const d = studioLayoutData();
    expect(d.products).toHaveLength(PREVIEW_PRODUCTS.length);
    expect((d.products as { name: string }[])[0].name).toBe('Aero Headphones');
    expect(d.categories).toHaveLength(PREVIEW_CATEGORIES.length);
    expect(d.title).toBeTruthy();
  });
});

describe('studioTokenStyle', () => {
  it('emits storefront CSS vars, not only the studio aliases', () => {
    const s = studioTokenStyle({
      primaryColor: '#112233',
      bodyBg: '#fafafa',
      bodyText: '#111111',
      mutedText: '#666666',
      borderColor: '#eeeeee',
      cardBg: '#ffffff',
      accentColor: '#2563eb',
      radius: 12,
    });
    expect(s['--brand']).toBe('#112233');
    expect(s['--primary']).toBe('#112233');
    expect(s['--body-bg']).toBe('#fafafa');
    expect(s['--bg']).toBe('#fafafa');
    expect(s['--body-text']).toBe('#111111');
    expect(s['--text']).toBe('#111111');
    expect(s['--radius']).toBe('12px');
  });

  it('emits density tokens (container, heading weight, shadow)', () => {
    const s = studioTokenStyle({
      containerWidth: 1280,
      headingWeight: 700,
      cardShadow: 'strong',
      buttonRadius: 4,
      baseFontSize: 15,
    });
    expect(s['--container']).toBe('1280px');
    expect(s['--heading-weight']).toBe('700');
    expect(s['--shadow']).toContain('0 10px 30px');
    expect(s['--btn-radius']).toBe('4px');
    expect(s['--font-size']).toBe('15px');
  });

  it('emits price/sale/header and a font stack', () => {
    const s = studioTokenStyle({
      priceColor: '#111',
      saleColor: '#dc2626',
      headerBg: '#fff',
      fontFamily: 'vazirmatn',
      primaryTextColor: '#eee',
    });
    expect(s['--price']).toBe('#111');
    expect(s['--sale']).toBe('#dc2626');
    expect(s['--header-bg']).toBe('#fff');
    expect(s['--brand-text']).toBe('#eee');
    expect(s['--font']).toMatch(/vazirmatn/i);
  });
});

describe('studioHomeMerch', () => {
  it('returns Product-shaped samples for HomeSectionStack', () => {
    const m = studioHomeMerch();
    expect(m.products[0].images.length).toBeGreaterThan(0);
    expect(m.products[0].slug).toBe(PREVIEW_PRODUCTS[0].slug);
    expect(m.banners[0].title).toBeTruthy();
    expect(m.categories).toHaveLength(PREVIEW_CATEGORIES.length);
  });
});

describe('studioLivePreviewPath', () => {
  it('maps home/products/blog and skips pages without a public URL', () => {
    expect(studioLivePreviewPath('home', 3)).toBe('/?homePreview=3');
    expect(studioLivePreviewPath('products', 1)).toBe('/products?studioPreview=1');
    expect(studioLivePreviewPath('blog', 1)).toBe('/blog?studioPreview=1');
    expect(studioLivePreviewPath('product', 1)).toBeNull();
  });
});
