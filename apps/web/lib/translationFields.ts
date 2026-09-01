// ---------------------------------------------------------------------------
// Field schemas for the per-locale content editor.
//
// Must mirror the API's TRANSLATABLE_FIELDS in
// apps/api/src/modules/contentTranslations/translatableFields.ts — the writer
// drops any key outside that set, so keeping the two in lockstep avoids saving
// a field the storefront will never overlay.
// ---------------------------------------------------------------------------
import type { TranslationField } from '@/components/ContentTranslationsEditor';

export const PRODUCT_TRANSLATION_FIELDS: TranslationField[] = [
  { key: 'name', label: 'Name' },
  { key: 'shortDescription', label: 'Short description', multiline: true, rows: 2 },
  { key: 'description', label: 'Description', multiline: true, rows: 6 },
  { key: 'metaTitle', label: 'SEO meta title' },
  { key: 'metaDescription', label: 'SEO meta description', multiline: true, rows: 2 },
];

export const CATEGORY_TRANSLATION_FIELDS: TranslationField[] = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', multiline: true, rows: 3 },
];

export const PAGE_TRANSLATION_FIELDS: TranslationField[] = [
  { key: 'title', label: 'Title' },
  { key: 'excerpt', label: 'Excerpt', multiline: true, rows: 2 },
  { key: 'content', label: 'Content', multiline: true, rows: 10 },
  { key: 'metaTitle', label: 'SEO meta title' },
  { key: 'metaDescription', label: 'SEO meta description', multiline: true, rows: 2 },
];

export const BLOG_TRANSLATION_FIELDS: TranslationField[] = [
  { key: 'title', label: 'Title' },
  { key: 'excerpt', label: 'Excerpt', multiline: true, rows: 2 },
  { key: 'content', label: 'Content', multiline: true, rows: 10 },
  { key: 'metaTitle', label: 'SEO meta title' },
  { key: 'metaDescription', label: 'SEO meta description', multiline: true, rows: 2 },
];
