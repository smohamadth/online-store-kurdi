// ---------------------------------------------------------------------------
// Service helpers that storefront read routes use to localize content.
//
// The routes in products/categories/pages/blog call these when a `lang`
// query param is present, so the storefront gets localized fields (with
// fallback to the default-language columns) without N+1 queries: one
// findMany for all the entity's translations for the requested locale,
// then an in-memory overlay.
// ---------------------------------------------------------------------------
import { prisma } from '../../config/database';
import { ContentEntityType, SupportedContentLocale, isSupportedContentLocale } from './translatableFields';
import { indexTranslationsById } from './localize.helpers';

/**
 * Resolve the `?lang=` query param into a supported locale, or null when the
 * caller should serve the default-language columns (no `lang`, or `lang=en`).
 */
export function resolveRequestedLocale(raw: unknown): SupportedContentLocale | null {
  if (typeof raw !== 'string' || raw === '' || raw.toLowerCase() === 'en') return null;
  const lower = raw.toLowerCase();
  return isSupportedContentLocale(lower) ? lower : null;
}

/**
 * Fetch translations for `ids` + `locale` and return a map of entityId ->
 * parsed translation data, ready for `localizeRows`. Returns {} when locale
 * is null (i.e. the default language / English), so callers skip the query.
 */
export async function loadTranslationsForIds(
  entityType: ContentEntityType,
  ids: string[],
  locale: SupportedContentLocale | null,
): Promise<Record<string, Record<string, unknown>>> {
  if (!locale || ids.length === 0) return {};
  const rows = await prisma.contentTranslation.findMany({
    where: {
      entityType,
      entityId: { in: ids },
      locale,
    },
  });
  return indexTranslationsById(rows as any[]);
}

/** Convenience: resolve `?lang=` then fetch the translation map for ids. */
export async function localizedMapFor(
  entityType: ContentEntityType,
  ids: string[],
  rawLang: unknown,
): Promise<Record<string, Record<string, unknown>>> {
  const locale = resolveRequestedLocale(rawLang);
  return loadTranslationsForIds(entityType, ids, locale);
}
