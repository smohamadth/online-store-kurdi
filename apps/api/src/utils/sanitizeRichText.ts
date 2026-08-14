/**
 * Server-side rich-text sanitiser.
 *
 * The admin editor sanitises as you type, but a client can POST anything
 * directly to the API. Since the storefront renders this HTML, stripping
 * scripts and event handlers here is what actually prevents stored XSS.
 *
 * Used by product descriptions and by the home page "rich text" block.
 */

const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'div',
];

export function sanitizeRichText(html: string): string {
  if (!html) return html;

  let out = html
    // Drop whole dangerous elements including their contents.
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[^>]*\/?>/gi, '')
    // Inline event handlers: onclick=, onerror=, ...
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // javascript:/data: URLs
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|data)\s*:[^"']*\2/gi, '$1="#"');

  // Remove any tag outside the allow-list, keeping inner text.
  out = out.replace(/<\/?([a-zA-Z0-9]+)\b[^>]*>/g, (match, tag) =>
    ALLOWED_TAGS.includes(String(tag).toLowerCase()) ? match : ''
  );

  return out.trim();
}
