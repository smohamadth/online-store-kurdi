// ---------------------------------------------------------------------------
// Localization helpers for content entities.
//
// A row's default-language columns (e.g. Product.name, Product.description)
// ARE the store's default language - the fallback when no translation exists
// for the visitor's locale. A ContentTranslation row overlays the same field
// names for a specific locale.
//
// The shape these helpers expect mirrors what the read routes already build
// (a product object, a category object, ...). They are pure functions so they
// are trivially unit-testable and used identically by every storefront read.
// ---------------------------------------------------------------------------

import { sanitizeRichText } from '../../utils/sanitizeRichText';
import {
  ContentEntityType,
  HTML_RENDERED_FIELDS,
  TRANSLATABLE_FIELDS,
  SupportedContentLocale,
} from './translatableFields';

/**
 * Sanitize one overlaid translation value when the field renders as HTML on
 * the storefront. Legacy rows (written before write-time sanitization) can
 * carry script-bearing markup, so the read path re-checks them — a malicious
 * translation can never reach a dangerouslySetInnerHTML render untouched.
 */
function sanitizeOverlay(entityType: ContentEntityType, key: string, value: unknown): unknown {
  if (typeof value === 'string' && (HTML_RENDERED_FIELDS[entityType] || []).includes(key)) {
    return sanitizeRichText(value);
  }
  return value;
}

/**
 * Apply a translation object (already JSON-parsed) onto a row by mutating
 * the translatable fields that are present in the translation. Returns the
 * row for convenience.
 *
 * `fallbackLocale` is the store's default language; translations are never
 * stored for it (the default-language columns already are that), so when the
 * requested locale equals the fallback we return the row untouched.
 */
export function localizeRow<T extends Record<string, unknown>>(
  row: T,
  translation: Record<string, unknown> | undefined | null,
  requestedLocale: string,
  fallbackLocale = 'en',
  entityType?: ContentEntityType,
): T {
  if (!translation || requestedLocale === fallbackLocale) return row;
  for (const [key, value] of Object.entries(translation)) {
    // Only overlay fields the entity actually translates (belt & braces -
    // the writer already strips unknowns, but a hand-edited row should not
    // reach a response).
    if (value !== undefined) {
      (row as Record<string, unknown>)[key] = entityType
        ? sanitizeOverlay(entityType, key, value)
        : value;
    }
  }
  return row;
}

/**
 * Build a map of entityId -> parsed translation data for a set of rows, so a
 * list read can overlay each row with one lookup instead of per-row queries.
 */
export function indexTranslationsById(
  translations: Array<{ entityId: string; data: string }>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const t of translations) {
    try {
      out[t.entityId] = JSON.parse(t.data || '{}');
    } catch {
      out[t.entityId] = {};
    }
  }
  return out;
}

/**
 * Overlay translations onto every row in a list. `entityType` selects which
 * fields may be overlaid. Returns new rows (does not mutate inputs).
 */
export function localizeRows<T extends Record<string, unknown>>(
  rows: T[],
  translationById: Record<string, Record<string, unknown>>,
  entityType: ContentEntityType,
  requestedLocale: string,
  fallbackLocale = 'en',
): T[] {
  const allowed = new Set(TRANSLATABLE_FIELDS[entityType]);
  if (requestedLocale === fallbackLocale) return rows;
  return rows.map((row) => {
    const id = row.id as string;
    const tr = translationById[id];
    if (!tr) return row;
    const copy = { ...row };
    for (const [key, value] of Object.entries(tr)) {
      if (allowed.has(key) && value !== undefined) {
        (copy as Record<string, unknown>)[key] = sanitizeOverlay(entityType, key, value);
      }
    }
    return copy;
  });
}
