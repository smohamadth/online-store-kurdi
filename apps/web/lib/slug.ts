/**
 * URL-slug helper.
 *
 * Lives in lib/ rather than in the page component because a Next.js `page.tsx`
 * may only export the page, `metadata`/`generateMetadata` and a few known
 * route options - any other named export fails the build with
 * "does not match the required types of a Next.js Page".
 *
 * Unicode-aware ON PURPOSE. The previous rule was `[^a-z0-9\s-]` which strips
 * every non-Latin character. For this store's primary market that meant a
 * Kurdish or Arabic title slugified to the EMPTY STRING:
 *
 *   "کۆمپانیای ئێمە"  ->  ""
 *
 * The admin then POSTed a blank slug, the page saved under something the user
 * never saw, and /p/<what-they-expected> returned 404. That is the "new pages
 * 404" report. Keeping letters from any script fixes it at the root; modern
 * browsers and Next.js handle percent-encoded UTF-8 path segments fine.
 *
 * Combining marks (\p{M}) are kept so Arabic/Kurdish diacritics survive.
 */
// Built with `new RegExp` rather than a literal: tsconfig targets ES5 and the
// compiler rejects the /u flag on a literal ("only available when targeting
// es6 or later"). Every browser we support has had Unicode property escapes
// since 2018, so the runtime behaviour is what we want either way.
const NON_SLUG_CHARS = new RegExp('[^\\p{L}\\p{N}\\p{M}\\s-]', 'gu');

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      // Normalise so accented Latin decomposes and recomposes predictably.
      .normalize('NFC')
      // Anything that is not a letter, number, mark, whitespace or hyphen goes.
      .replace(NON_SLUG_CHARS, '')
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
      // slice() may have left a trailing hyphen.
      .replace(/-+$/, '')
  );
}

/**
 * Never returns an empty string.
 *
 * Even with Unicode support a title can slugify to nothing - "!!!", "***", or
 * a string of emoji. Saving a blank slug is what produced the 404, so callers
 * that feed a form field should use this and always have something valid.
 */
export function slugifyWithFallback(input: string, prefix = 'page'): string {
  const s = slugify(input);
  if (s) return s;
  return `${prefix}-${Date.now().toString(36)}`;
}
