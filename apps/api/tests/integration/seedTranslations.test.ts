/**
 * End-to-end check of the multilingual seed.
 *
 * Runs the real `seedContentTranslations` against the in-memory prisma mock
 * and then feeds the result through the SAME localize helpers the storefront
 * read paths use. This is what proves the fixtures actually change what a
 * visitor sees, rather than just being well-formed JSON sitting in a table.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrisma, resetMockPrisma } from '../helpers/mockPrisma';
import {
  seedContentTranslations,
  TRANSLATED_LOCALES,
} from '../../prisma/seed-translations';
import { localizeRow } from '../../src/modules/contentTranslations/localize.helpers';

/** Create the entities the fixtures attach to (matched by slug). */
async function seedEntities() {
  await mockPrisma.product.create({
    data: { slug: 'iphone-15-pro', name: 'iPhone 15 Pro', description: 'English description' },
  });
  await mockPrisma.product.create({
    data: { slug: 'classic-t-shirt', name: 'Classic T-Shirt', description: 'A comfy tee' },
  });
  await mockPrisma.category.create({
    data: { slug: 'electronics', name: 'Electronics', description: 'Devices' },
  });
  await mockPrisma.page.create({
    data: { slug: 'about-us', title: 'About Us', content: '<p>English body</p>' },
  });
  await mockPrisma.blogPost.create({
    data: { slug: 'welcome-to-our-store', title: 'Welcome', content: '<p>Hello</p>' },
  });
}

/** Read one stored translation back as the routes would. */
async function translationFor(entityType: string, entityId: string, locale: string) {
  const row = await mockPrisma.contentTranslation.findFirst({
    where: { entityType, entityId, locale },
  });
  return row ? JSON.parse(row.data) : null;
}

describe('seedContentTranslations', () => {
  beforeEach(async () => {
    await resetMockPrisma();
    await seedEntities();
  });

  it('writes a row per locale for every matched entity', async () => {
    const total = await seedContentTranslations(mockPrisma as never);

    // 5 entities x 4 non-English locales.
    expect(total).toBe(5 * TRANSLATED_LOCALES.length);

    const rows = await mockPrisma.contentTranslation.findMany({});
    expect(rows).toHaveLength(20);
    // English is the fallback and must never be stored.
    expect(rows.every((r: any) => r.locale !== 'en')).toBe(true);
  });

  it('skips entities that are not in the database without failing', async () => {
    // Only the products exist this time; pages/categories/posts are absent.
    await resetMockPrisma();
    await mockPrisma.product.create({
      data: { slug: 'iphone-15-pro', name: 'iPhone 15 Pro', description: 'x' },
    });

    const total = await seedContentTranslations(mockPrisma as never);
    expect(total).toBe(TRANSLATED_LOCALES.length);
  });

  it('is idempotent - a second run updates rather than duplicating', async () => {
    await seedContentTranslations(mockPrisma as never);
    await seedContentTranslations(mockPrisma as never);

    const rows = await mockPrisma.contentTranslation.findMany({});
    // The @@unique([entityType, entityId, locale]) constraint means a re-run
    // must upsert. Duplicated rows here would mean the seed is not re-runnable.
    expect(rows).toHaveLength(20);
  });

  it('stores valid JSON containing only translatable fields', async () => {
    await seedContentTranslations(mockPrisma as never);
    const product = await mockPrisma.product.findFirst({ where: { slug: 'iphone-15-pro' } });

    const ku = await translationFor('product', product.id, 'ku');
    expect(ku).toBeTruthy();
    expect(Object.keys(ku).sort()).toEqual(
      ['description', 'metaDescription', 'metaTitle', 'name', 'shortDescription'].sort(),
    );
  });
});

describe('seeded translations change what the storefront renders', () => {
  beforeEach(async () => {
    await resetMockPrisma();
    await seedEntities();
    await seedContentTranslations(mockPrisma as never);
  });

  it('overlays the localized product name for each RTL locale', async () => {
    const product = await mockPrisma.product.findFirst({ where: { slug: 'iphone-15-pro' } });

    for (const locale of ['ku', 'ar', 'fa']) {
      const translation = await translationFor('product', product.id, locale);
      const localized = localizeRow({ ...product }, translation, locale, 'en', 'product');

      expect(localized.name).not.toBe('iPhone 15 Pro');
      // Arabic-script range: the visible name must actually be in-script.
      expect(localized.name).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('overlays Turkish without switching script', async () => {
    const product = await mockPrisma.product.findFirst({ where: { slug: 'classic-t-shirt' } });
    const tr = await translationFor('product', product.id, 'tr');
    const localized = localizeRow({ ...product }, tr, 'tr', 'en', 'product');

    expect(localized.name).toBe('Klasik Tişört');
    expect(localized.name).not.toMatch(/[\u0600-\u06FF]/);
  });

  it('leaves the row untouched for the English fallback', async () => {
    const product = await mockPrisma.product.findFirst({ where: { slug: 'iphone-15-pro' } });
    // No 'en' row exists, and localizeRow short-circuits on the fallback.
    const localized = localizeRow({ ...product }, null, 'en', 'en', 'product');
    expect(localized.name).toBe('iPhone 15 Pro');
  });

  it('localizes categories, pages and blog posts too', async () => {
    const category = await mockPrisma.category.findFirst({ where: { slug: 'electronics' } });
    const catAr = await translationFor('category', category.id, 'ar');
    expect(localizeRow({ ...category }, catAr, 'ar', 'en', 'category').name).toBe('إلكترونيات');

    const page = await mockPrisma.page.findFirst({ where: { slug: 'about-us' } });
    const pageFa = await translationFor('page', page.id, 'fa');
    expect(localizeRow({ ...page }, pageFa, 'fa', 'en', 'page').title).toBe('درباره ما');

    const post = await mockPrisma.blogPost.findFirst({ where: { slug: 'welcome-to-our-store' } });
    const postKu = await translationFor('blogPost', post.id, 'ku');
    expect(localizeRow({ ...post }, postKu, 'ku', 'en', 'blogPost').title).toBe(
      'بەخێربێن بۆ فرۆشگاکەمان',
    );
  });

  it('keeps translated HTML intact through the sanitizing read path', async () => {
    // page.content is in HTML_RENDERED_FIELDS, so localizeRow sanitizes it.
    // The fixtures use a plain <h2>/<p>/<ul> subset, which must survive.
    const page = await mockPrisma.page.findFirst({ where: { slug: 'about-us' } });
    const fa = await translationFor('page', page.id, 'fa');
    const localized = localizeRow({ ...page }, fa, 'fa', 'en', 'page');

    expect(localized.content).toContain('<h2>');
    expect(localized.content).toContain('<p>');
    expect(localized.content).toMatch(/[\u0600-\u06FF]/);
    expect(localized.content).not.toContain('<script');
  });
});
