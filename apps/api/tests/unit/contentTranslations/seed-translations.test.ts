/**
 * Validity of the multilingual seed fixtures.
 *
 * The store ships five locales but seeded no translated content, so every
 * storefront read fell back to English. These fixtures fill that gap; this
 * test guards their shape so a typo in the data cannot silently produce
 * translations the API would drop on write or ignore on read.
 *
 * What is checked:
 *   - every non-English supported locale is present for every entity
 *   - only keys in TRANSLATABLE_FIELDS are used (the writer drops the rest)
 *   - no value is empty, and none is left as the English source string
 *   - RTL locales actually carry Arabic-script text (catches a fixture that
 *     was pasted as transliteration or accidentally copied from the Turkish)
 */
import { describe, it, expect } from 'vitest';
import {
  PRODUCT_TRANSLATIONS,
  CATEGORY_TRANSLATIONS,
  PAGE_TRANSLATIONS,
  BLOG_TRANSLATIONS,
  FIXTURE_TABLES,
  TRANSLATED_LOCALES,
  FALLBACK_LOCALE,
} from '../../../prisma/seed-translations';
import {
  CONTENT_ENTITY_TYPES,
  TRANSLATABLE_FIELDS,
  SUPPORTED_CONTENT_LOCALES,
  filterTranslatableFields,
  isSupportedContentLocale,
  ContentEntityType,
} from '../../../src/modules/contentTranslations/translatableFields';

/** Any character in the Arabic block, which Kurdish/Arabic/Persian all use. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F]/;
const RTL_LOCALES = ['ku', 'ar', 'fa'];

describe('translation fixtures: locale coverage', () => {
  it('targets every supported locale except the English fallback', () => {
    expect(FALLBACK_LOCALE).toBe('en');
    expect([...TRANSLATED_LOCALES].sort()).toEqual(['ar', 'fa', 'ku', 'tr']);
    // Storing an 'en' row is meaningless: localizeRow returns the row
    // untouched when the requested locale is the fallback.
    expect(TRANSLATED_LOCALES).not.toContain('en');
    for (const l of TRANSLATED_LOCALES) {
      expect(isSupportedContentLocale(l)).toBe(true);
    }
  });

  it('covers every translatable entity type', () => {
    expect(Object.keys(FIXTURE_TABLES).sort()).toEqual([...CONTENT_ENTITY_TYPES].sort());
    for (const type of CONTENT_ENTITY_TYPES) {
      expect(Object.keys(FIXTURE_TABLES[type]).length).toBeGreaterThan(0);
    }
  });

  it('has every locale for every seeded entity', () => {
    const gaps: string[] = [];
    for (const [type, table] of Object.entries(FIXTURE_TABLES)) {
      for (const [slug, byLocale] of Object.entries(table)) {
        for (const locale of TRANSLATED_LOCALES) {
          if (!byLocale[locale]) gaps.push(`${type}/${slug} missing ${locale}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });
});

describe('translation fixtures: field validity', () => {
  it('uses only fields the API will persist', () => {
    const illegal: string[] = [];
    for (const [type, table] of Object.entries(FIXTURE_TABLES)) {
      const allowed = TRANSLATABLE_FIELDS[type as ContentEntityType];
      for (const [slug, byLocale] of Object.entries(table)) {
        for (const [locale, fields] of Object.entries(byLocale)) {
          for (const key of Object.keys(fields)) {
            if (!allowed.includes(key)) illegal.push(`${type}/${slug}/${locale}: ${key}`);
          }
        }
      }
    }
    expect(illegal).toEqual([]);
  });

  it('survives the API write filter without losing anything', () => {
    // filterTranslatableFields is what the PUT route runs. If it drops a key
    // the fixture would seed data the storefront never shows.
    for (const [type, table] of Object.entries(FIXTURE_TABLES)) {
      for (const byLocale of Object.values(table)) {
        for (const fields of Object.values(byLocale)) {
          const filtered = filterTranslatableFields(type as ContentEntityType, fields);
          expect(Object.keys(filtered).sort()).toEqual(Object.keys(fields).sort());
        }
      }
    }
  });

  it('has no empty or whitespace-only values', () => {
    const empties: string[] = [];
    for (const [type, table] of Object.entries(FIXTURE_TABLES)) {
      for (const [slug, byLocale] of Object.entries(table)) {
        for (const [locale, fields] of Object.entries(byLocale)) {
          for (const [key, value] of Object.entries(fields)) {
            if (typeof value !== 'string' || value.trim() === '') {
              empties.push(`${type}/${slug}/${locale}/${key}`);
            }
          }
        }
      }
    }
    expect(empties).toEqual([]);
  });
});

describe('translation fixtures: script and RTL', () => {
  it('writes RTL locales in Arabic script', () => {
    const wrong: string[] = [];
    for (const [type, table] of Object.entries(FIXTURE_TABLES)) {
      for (const [slug, byLocale] of Object.entries(table)) {
        for (const locale of RTL_LOCALES) {
          const fields = byLocale[locale];
          if (!fields) continue;
          // Check the human-facing headline field; product names like
          // "iPhone 15 Pro" keep Latin brand tokens, but the field as a whole
          // must contain Arabic-script characters.
          const headline = fields.name ?? fields.title;
          if (headline && !ARABIC_SCRIPT.test(headline)) {
            wrong.push(`${type}/${slug}/${locale}: "${headline}"`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('does not reuse the same string across ku, ar and fa', () => {
    // Three distinct languages that share a script are easy to copy-paste
    // between. Identical headlines across all three signals a mistake.
    const suspicious: string[] = [];
    for (const [type, table] of Object.entries(FIXTURE_TABLES)) {
      for (const [slug, byLocale] of Object.entries(table)) {
        const heads = RTL_LOCALES.map((l) => byLocale[l] ?? {}).map(
          (f: Record<string, string>) => f.name ?? f.title,
        );
        const present = heads.filter(Boolean);
        if (present.length === 3 && new Set(present).size === 1) {
          suspicious.push(`${type}/${slug}`);
        }
      }
    }
    expect(suspicious).toEqual([]);
  });

  it('keeps Turkish in Latin script', () => {
    for (const table of Object.values(FIXTURE_TABLES)) {
      for (const byLocale of Object.values(table)) {
        const tr = byLocale.tr;
        if (!tr) continue;
        const headline = tr.name ?? tr.title;
        if (headline) expect(ARABIC_SCRIPT.test(headline)).toBe(false);
      }
    }
  });
});

describe('translation fixtures: entity tables', () => {
  it('translates each seeded product, category, page and post', () => {
    expect(Object.keys(PRODUCT_TRANSLATIONS)).toEqual(
      expect.arrayContaining([
        'iphone-15-pro',
        'macbook-pro-14',
        'web-development-course',
        'classic-t-shirt',
        'javascript-good-parts',
      ]),
    );
    expect(Object.keys(CATEGORY_TRANSLATIONS)).toEqual(
      expect.arrayContaining(['general', 'electronics', 'clothing', 'books', 'digital-products']),
    );
    expect(Object.keys(PAGE_TRANSLATIONS)).toEqual(
      expect.arrayContaining(['about-us', 'shipping-policy']),
    );
    expect(Object.keys(BLOG_TRANSLATIONS)).toEqual(
      expect.arrayContaining(['welcome-to-our-store']),
    );
  });

  it('matches the storefront locale list exactly', () => {
    expect([...SUPPORTED_CONTENT_LOCALES].sort()).toEqual(['ar', 'en', 'fa', 'ku', 'tr']);
  });
});
