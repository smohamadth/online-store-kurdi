// ---------------------------------------------------------------------------
// Safe URL validation for admin-controlled link fields.
//
// Menu items, banner links etc. are rendered straight into `<a href>`
// attributes in the storefront themes. A stored `javascript:alert(1)`
// URL would execute as script in every visitor's browser, so link fields
// must be restricted to real navigable targets: http(s), mailto:, tel:,
// and same-site relative paths (/, #, ? or no scheme at all).
// ---------------------------------------------------------------------------

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * True when the value is safe to use as an `<a href>` (or empty/absent).
 * - empty strings / whitespace-only: safe (no link)
 * - relative paths (`/about`, `#faq`, `?q=1`, `products/1`): safe
 * - http/https/mailto/tel: safe
 * - anything else with a scheme (`javascript:`, `data:text/html`,
 *   `vbscript:`, custom app schemes, protocol-relative `//` is fine
 *   because it has no scheme): unsafe
 */
export function isSafeLinkUrl(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  // No scheme -> relative/anchored link, safe.
  if (!HAS_SCHEME.test(trimmed)) return true;
  return SAFE_SCHEMES.has(trimmed.slice(0, trimmed.indexOf(':')).toLowerCase() + ':');
}
