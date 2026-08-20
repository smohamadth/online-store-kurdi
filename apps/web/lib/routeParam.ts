/**
 * Safely re-encode a dynamic route segment for use in an API URL.
 *
 * Next.js hands `params.slug` to a server component ALREADY percent-encoded
 * when the URL contains non-ASCII characters. Calling `encodeURIComponent` on
 * it therefore double-encodes:
 *
 *   /p/کۆمپانیا
 *     params.slug            = '%DA%A9%DB%86...'
 *     encodeURIComponent(..) = '%25DA%25A9%25DB%2586...'   <-- '%' escaped again
 *     API lookup             = miss -> null -> "Page not found"
 *
 * The page still returned HTTP 200 (the middleware only rewrites known 404
 * routes), so it looked like the page had saved but vanished. Decoding first
 * makes the operation idempotent: an already-decoded slug is unchanged, and an
 * encoded one is normalised before being re-encoded exactly once.
 *
 * `decodeURIComponent` throws on a malformed sequence such as '%zz', which is
 * reachable from a hand-typed URL, so the raw value is used in that case.
 */
export function encodeRouteParam(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed escape - fall back to the raw segment.
  }
  return encodeURIComponent(decoded);
}
