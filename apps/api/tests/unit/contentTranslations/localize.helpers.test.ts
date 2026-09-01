import { describe, it, expect } from 'vitest';
import {
  localizeRow,
  localizeRows,
  indexTranslationsById,
} from '../../../src/modules/contentTranslations/localize.helpers';
import {
  filterTranslatableFields,
  isContentEntityType,
  isSupportedContentLocale,
  TRANSLATABLE_FIELDS,
} from '../../../src/modules/contentTranslations/translatableFields';

describe('localizeRow', () => {
  it('returns the row untouched for the fallback locale', () => {
    const row = { id: '1', name: 'iPhone', description: 'A phone' };
    const out = localizeRow(row, { name: 'آیفون' }, 'en');
    expect(out).toEqual({ id: '1', name: 'iPhone', description: 'A phone' });
  });

  it('overlays a translation for a non-fallback locale', () => {
    const row = { id: '1', name: 'iPhone', description: 'A phone' };
    const out = localizeRow(row, { name: 'ئایفۆن', description: 'تەلەفۆنێک' }, 'ku');
    expect(out.name).toBe('ئایفۆن');
    expect(out.description).toBe('تەلەفۆنێک');
  });

  it('keeps the fallback field when the translation omits it', () => {
    const row = { id: '1', name: 'iPhone', description: 'A phone' };
    const out = localizeRow(row, { name: 'آیفون' }, 'fa');
    expect(out.name).toBe('آیفون');
    expect(out.description).toBe('A phone');
  });

  it('handles null/undefined translation', () => {
    const row = { id: '1', name: 'iPhone' };
    expect(localizeRow(row, null, 'ar').name).toBe('iPhone');
    expect(localizeRow(row, undefined, 'ar').name).toBe('iPhone');
  });

  it('sanitizes HTML-rendered fields on read (legacy-row guard)', () => {
    // Regression: rows written before write-time sanitization can still
    // carry script markup; the READ path must neutralize it before the
    // storefront renders it with dangerouslySetInnerHTML.
    const row = { id: '1', title: 'P', content: '<p>ok</p>' };
    const out = localizeRow(
      row,
      { title: 'پەڕە', content: '<p>hi</p><script>alert(1)</script>' },
      'ku',
      'en',
      'page',
    );
    expect(out.content).toContain('<p>hi</p>');
    expect(out.content).not.toContain('<script');
    // Plain-text fields are untouched.
    expect(out.title).toBe('پەڕە');
  });
});

describe('localizeRows + indexTranslationsById', () => {
  it('overlays each row by id in a list', () => {
    const rows = [
      { id: 'a', name: 'One' },
      { id: 'b', name: 'Two' },
    ];
    const idx = indexTranslationsById([
      { entityId: 'a', data: JSON.stringify({ name: 'یەک' }) },
      { entityId: 'b', data: 'not-json' }, // corrupt -> {}
    ]);
    const out = localizeRows(rows, idx, 'product', 'ku');
    expect(out[0].name).toBe('یەک');
    expect(out[1].name).toBe('Two'); // corrupt data stays fallback
  });

  it('does nothing for the fallback locale', () => {
    const rows = [{ id: 'a', name: 'One' }];
    const idx = indexTranslationsById([{ entityId: 'a', data: JSON.stringify({ name: 'یەک' }) }]);
    const out = localizeRows(rows, idx, 'product', 'en');
    expect(out[0].name).toBe('One');
  });
});

describe('filterTranslatableFields', () => {
  it('keeps only legal fields for the entity type', () => {
    const out = filterTranslatableFields('product', {
      name: 'x',
      description: 'y',
      hacked: 'z',
      sku: 'SKU1', // not translatable for products
    });
    expect(out).toEqual({ name: 'x', description: 'y' });
    expect(out.hacked).toBeUndefined();
    expect(out.sku).toBeUndefined();
  });

  it('page translation keeps title/content/excerpt/meta', () => {
    const out = filterTranslatableFields('page', {
      title: 't',
      content: 'c',
      excerpt: 'e',
      metaTitle: 'm',
      metaDescription: 'md',
      blocks: 'b', // blocks are not translated (shared structure)
    });
    expect(out).toEqual({ title: 't', content: 'c', excerpt: 'e', metaTitle: 'm', metaDescription: 'md' });
    expect(out.blocks).toBeUndefined();
  });
});

describe('field/type guards', () => {
  it('TRANSLATABLE_FIELDS has the four entities', () => {
    expect(Object.keys(TRANSLATABLE_FIELDS).sort()).toEqual(['blogPost', 'category', 'page', 'product']);
  });

  it('isContentEntityType / isSupportedContentLocale', () => {
    expect(isContentEntityType('product')).toBe(true);
    expect(isContentEntityType('bogus')).toBe(false);
    expect(isSupportedContentLocale('ku')).toBe(true);
    expect(isSupportedContentLocale('xx')).toBe(false);
  });
});
