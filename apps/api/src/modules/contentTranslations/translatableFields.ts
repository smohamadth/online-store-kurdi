// ---------------------------------------------------------------------------
// Which fields are translatable per content entity.
//
// The default-language columns on the row are the fallback; a ContentTranslation
// row overrides the same field names for a locale. Keeping the field set fixed
// here (not read from the JSON payload) means a stored translation can never
// smuggle a key the storefront does not expect into a response.
// ---------------------------------------------------------------------------

export type ContentEntityType = 'product' | 'category' | 'page' | 'blogPost';

/** All the entity types the translation table can hold. */
export const CONTENT_ENTITY_TYPES: readonly ContentEntityType[] = [
  'product',
  'category',
  'page',
  'blogPost',
];

/**
 * The translatable content fields per entity type. Only these keys are
 * accepted on write and overlaid on read. Any other key in a payload is
 * dropped by the writer.
 */
export const TRANSLATABLE_FIELDS: Record<ContentEntityType, string[]> = {
  product: ['name', 'description', 'shortDescription', 'metaTitle', 'metaDescription'],
  category: ['name', 'description'],
  page: ['title', 'content', 'excerpt', 'metaTitle', 'metaDescription'],
  blogPost: ['title', 'content', 'excerpt', 'metaTitle', 'metaDescription'],
};

/** The locales the storefront can display (must stay in lockstep with the web's SUPPORTED_LOCALES). */
export const SUPPORTED_CONTENT_LOCALES = ['en', 'ku', 'ar', 'fa', 'tr'] as const;
export type SupportedContentLocale = (typeof SUPPORTED_CONTENT_LOCALES)[number];

export function isContentEntityType(v: string): v is ContentEntityType {
  return (CONTENT_ENTITY_TYPES as readonly string[]).includes(v);
}

export function isSupportedContentLocale(v: string): v is SupportedContentLocale {
  return (SUPPORTED_CONTENT_LOCALES as readonly string[]).includes(v);
}

/**
 * Pick the subset of `payload` that is a legal translation for `entityType`,
 * dropping any unknown key. Values are kept as authored (strings/booleans),
 * so a client cannot smuggle a key outside TRANSLATABLE_FIELDS.
 */
export function filterTranslatableFields(
  entityType: ContentEntityType,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = TRANSLATABLE_FIELDS[entityType];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) out[key] = payload[key];
  }
  return out;
}
