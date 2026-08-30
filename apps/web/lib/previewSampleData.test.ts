/**
 * previewSampleData — fixture tests.
 *
 * The preview's data is intentionally tiny: 4 products, 4
 * categories. The test pins the shape so a refactor that
 * breaks the section-component contract (which reads
 * `name`, `slug`, `price`, `images`, `category` per
 * product) fails loudly.
 */

import { describe, it, expect } from 'vitest';
import {
  PREVIEW_PRODUCTS,
  PREVIEW_CATEGORIES,
  PREVIEW_STORE,
  type PreviewProduct,
  type PreviewCategory,
} from './previewSampleData';

describe('previewSampleData — products', () => {
  it('ships 4 products', () => {
    expect(PREVIEW_PRODUCTS).toHaveLength(4);
  });

  it('every product has the required fields', () => {
    for (const p of PREVIEW_PRODUCTS) {
      expect(p.id, 'id').toBeTruthy();
      expect(p.name, 'name').toBeTruthy();
      expect(p.slug, 'slug').toBeTruthy();
      expect(typeof p.price, 'price').toBe('number');
      expect(p.price).toBeGreaterThan(0);
      expect(p.category.name, 'category.name').toBeTruthy();
      expect(p.category.slug, 'category.slug').toBeTruthy();
      expect(p.accent, 'accent').toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('every product slug is URL-safe', () => {
    for (const p of PREVIEW_PRODUCTS) {
      expect(p.slug, `${p.slug}`).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('every product has a unique id', () => {
    const ids = PREVIEW_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every product has a unique slug', () => {
    const slugs = PREVIEW_PRODUCTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('previewSampleData — categories', () => {
  it('ships 4 categories', () => {
    expect(PREVIEW_CATEGORIES).toHaveLength(4);
  });

  it('every category has the required fields', () => {
    for (const c of PREVIEW_CATEGORIES) {
      expect(c.name, 'name').toBeTruthy();
      expect(c.slug, 'slug').toBeTruthy();
      expect(typeof c.count, 'count').toBe('number');
      expect(c.count).toBeGreaterThanOrEqual(0);
      expect(c.accent, 'accent').toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('every category has a unique slug', () => {
    const slugs = PREVIEW_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('previewSampleData — store', () => {
  it('has a non-empty name', () => {
    expect(PREVIEW_STORE.name).toBeTruthy();
    expect(PREVIEW_STORE.name.length).toBeGreaterThan(2);
  });

  it('has a non-empty description', () => {
    expect(PREVIEW_STORE.description).toBeTruthy();
    expect(PREVIEW_STORE.description.length).toBeGreaterThan(10);
  });
});

describe('previewSampleData — types', () => {
  // Compile-time test (this would fail TS if the types
  // drift). At runtime we just assert the import is a
  // non-null object.
  it('exports the type interfaces', () => {
    const product: PreviewProduct = PREVIEW_PRODUCTS[0];
    const category: PreviewCategory = PREVIEW_CATEGORIES[0];
    expect(product).toBeDefined();
    expect(category).toBeDefined();
  });
});
