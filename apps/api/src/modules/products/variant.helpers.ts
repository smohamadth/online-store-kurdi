/**
 * Pure helpers for product variants.
 *
 * Kept in a separate module from `variant.service.ts` so the unit
 * tests can import them without dragging in the prisma client
 * (which fails to load outside the integration test environment).
 *
 * The service module re-exports these for the route layer.
 */

// ---------------------------------------------------------------------
// Attribute round-trip
// ---------------------------------------------------------------------

/**
 * Normalise the `attributes` column on a variant row.
 *
 * The schema column is a string (`String @default("{}")`) but the
 * API exposes attributes as an object on read and an object on
 * write. Accept both shapes on input so callers don't have to
 * know about the storage format:
 *
 *   {}                                  -> '{}'
 *   { color: 'red' }                    -> '{"color":"red"}'
 *   '{"color":"red"}'                   -> '{"color":"red"}' (unchanged)
 *   ''                                  -> '{}'
 *   'not-json'                          -> throw 400
 *   null / undefined                    -> '{}'
 */
export function serializeAttributes(
  attrs: Record<string, unknown> | string | null | undefined
): string {
  if (attrs === null || attrs === undefined) return '{}';
  if (typeof attrs === 'string') {
    if (attrs === '') return '{}';
    // Round-trip through JSON.parse to validate. Throws on garbage.
    try {
      JSON.parse(attrs);
      return attrs;
    } catch {
      throw new Error('attributes must be a valid JSON string');
    }
  }
  if (typeof attrs === 'object') {
    return JSON.stringify(attrs);
  }
  throw new Error('attributes must be an object or JSON string');
}

/**
 * The inverse: turn a stored string back into an object. Returns
 * `{}` for null/empty/invalid input rather than throwing - the
 * storefront renders `{}` as "no attributes" so a malformed row
 * shouldn't take down the page.
 */
export function parseAttributes(
  raw: string | null | undefined
): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    return {};
  } catch {
    return {};
  }
}
