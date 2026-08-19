/**
 * URL-slug helper.
 *
 * Lives in lib/ rather than in the page component because a Next.js `page.tsx`
 * may only export the page, `metadata`/`generateMetadata` and a few known
 * route options - any other named export fails the build with
 * "does not match the required types of a Next.js Page".
 *
 * Mirrors the rule the API enforces: lowercase letters, digits and single
 * hyphens.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
