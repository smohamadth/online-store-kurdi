import { describe, it, expect } from 'vitest';
import { isSafeLinkUrl } from '../../../src/utils/safeUrl';

describe('isSafeLinkUrl', () => {
  it('accepts http/https/mailto/tel', () => {
    expect(isSafeLinkUrl('https://example.com')).toBe(true);
    expect(isSafeLinkUrl('http://example.com/path?q=1')).toBe(true);
    expect(isSafeLinkUrl('mailto:info@example.com')).toBe(true);
    expect(isSafeLinkUrl('tel:+1-555-0100')).toBe(true);
    expect(isSafeLinkUrl('HTTP://EXAMPLE.COM')).toBe(true); // case-insensitive
  });

  it('accepts relative and anchored links', () => {
    expect(isSafeLinkUrl('/products')).toBe(true);
    expect(isSafeLinkUrl('#faq')).toBe(true);
    expect(isSafeLinkUrl('?sort=asc')).toBe(true);
    expect(isSafeLinkUrl('products/slug')).toBe(true);
    expect(isSafeLinkUrl('//cdn.example.com/x.png')).toBe(true); // protocol-relative
  });

  it('accepts empty/null (no link)', () => {
    expect(isSafeLinkUrl('')).toBe(true);
    expect(isSafeLinkUrl('   ')).toBe(true);
    expect(isSafeLinkUrl(null)).toBe(true);
    expect(isSafeLinkUrl(undefined)).toBe(true);
  });

  it('rejects script-bearing schemes', () => {
    expect(isSafeLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeLinkUrl('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeLinkUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeLinkUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeLinkUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeLinkUrl('app-custom-scheme://x')).toBe(false);
  });

  it('treats entity-encoded colons as safe (not a scheme)', () => {
    // Browsers do not decode HTML entities inside href before URL
    // parsing, so 'javascript&#58;...' is not a javascript: URL — it is
    // a (harmless) relative path. Only a literal colon forms a scheme.
    expect(isSafeLinkUrl('javascript&#58;alert(1)')).toBe(true);
  });
});
