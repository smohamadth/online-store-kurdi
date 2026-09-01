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

/**
 * Decode numeric character references (&#106;, &#x6A;) so scheme checks
 * cannot be bypassed with entity-obfuscated URLs. The browser's HTML
 * parser decodes these in attribute VALUES before the URL is interpreted,
 * so "java&#x73;cript:alert(1)" IS a javascript: URL — the sanitizer must
 * see it as one too. (Attribute NAMES are not entity-decoded by browsers,
 * so event-handler names cannot be obfuscated this way.)
 */
function decodeNumericEntities(value: string): string {
  return value.replace(/&#(x?)([0-9a-fA-F]+);/g, (_m, hex: string, digits: string) => {
    const codePoint = hex ? parseInt(digits, 16) : parseInt(digits, 10);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return _m;
    return String.fromCodePoint(codePoint);
  });
}

/** True when `value` is (after entity decoding + C0/space trimming) a scriptable URL scheme. */
function isScriptableUrl(value: string): boolean {
  // Leading ASCII whitespace and C0 controls are stripped by the URL
  // parser before scheme detection (&#9;javascript: -> \tjavascript:),
  // so tolerate them here.
  return /^[\x00-\x20]*(javascript|data|vbscript)\s*:/i.test(decodeNumericEntities(value));
}

export function sanitizeRichText(html: string): string {
  if (!html) return html;

  let out = html
    // Drop whole dangerous elements including their contents.
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[^>]*\/?>/gi, '')
    // Inline event handlers: onclick=, onerror=, ...
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // javascript:/data:/vbscript: URLs, including entity-obfuscated and
    // control-character-padded spellings (see isScriptableUrl).
    //
    // data: matters more now that <img> is allowed: an SVG data URI can carry
    // a <script>, so "data:image/svg+xml;base64,..." is a genuine XSS vector.
    // Images must reference an uploaded file, not inline bytes.
    .replace(/(href|src)\s*=\s*("|')([\s\S]*?)\2/gi, (match, attr: string, _quote: string, value: string) =>
      isScriptableUrl(value) ? `${attr}="#"` : match
    )
    // Same, unquoted.
    .replace(/(href|src)\s*=\s*([^\s"'=<>`]+)/gi, (match, attr: string, value: string) =>
      isScriptableUrl(value) ? `${attr}="#"` : match
    )
    // srcset can smuggle the same payload and nothing here needs it.
    .replace(/\ssrcset\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove any tag outside the allow-list, keeping inner text.
  out = out.replace(/<\/?([a-zA-Z0-9]+)\b[^>]*>/g, (match, tag) =>
    ALLOWED_TAGS.includes(String(tag).toLowerCase()) ? match : ''
  );

  return out.trim();
}
