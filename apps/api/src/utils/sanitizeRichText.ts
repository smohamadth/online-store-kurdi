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
  // Images inside page and post bodies. Safe because the src rules below
  // reject javascript: and data: URLs, and every on* handler is stripped
  // before the tag allow-list runs. figure/figcaption support captions.
  'img', 'figure', 'figcaption',
];

export function sanitizeRichText(html: string): string {
  if (!html) return html;

  let out = html
    // Drop whole dangerous elements including their contents.
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[^>]*\/?>/gi, '')
    // Inline event handlers: onclick=, onerror=, ...
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // javascript:/data: URLs.
    //
    // data: matters more now that <img> is allowed: an SVG data URI can carry
    // a <script>, so "data:image/svg+xml;base64,..." is a genuine XSS vector.
    // Images must reference an uploaded file, not inline bytes.
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|data|vbscript)\s*:[^"']*\2/gi, '$1="#"')
    // Same, unquoted.
    .replace(/(href|src)\s*=\s*(javascript|data|vbscript)\s*:[^\s>]*/gi, '$1="#"')
    // srcset can smuggle the same payload and nothing here needs it.
    .replace(/\ssrcset\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove any tag outside the allow-list, keeping inner text.
  out = out.replace(/<\/?([a-zA-Z0-9]+)\b[^>]*>/g, (match, tag) =>
    ALLOWED_TAGS.includes(String(tag).toLowerCase()) ? match : ''
  );

  return out.trim();
}
