/**
 * sanitizeRichText — server-side XSS guard.
 *
 * The function is the one thing standing between an admin-supplied HTML
 * string and a stored XSS in the storefront. Tests cover:
 *   - tag allow-list enforcement
 *   - script/iframe/etc. removal (both paired and unpaired)
 *   - inline event handler stripping
 *   - javascript:/data: URL neutralisation
 *   - srcset neutralisation
 *   - preservation of safe content
 */
import { describe, it, expect } from 'vitest';
import { sanitizeRichText } from '../../../src/utils/sanitizeRichText';

describe('sanitizeRichText', () => {
  it('returns falsy values untouched (no crash, no mutation)', () => {
    // The function documents the early return for falsy input. Anything
    // that slips through "" here is a no-op but must not throw.
    expect(sanitizeRichText('')).toBe('');
    expect(sanitizeRichText(undefined as any)).toBe(undefined as any);
    expect(sanitizeRichText(null as any)).toBe(null as any);
  });

  it('keeps allowed tags and their attributes intact', () => {
    const html = '<p>Hello <strong>World</strong></p>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('preserves allowed links with safe href', () => {
    const html = '<a href="https://example.com/path">link</a>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('preserves images with safe src', () => {
    const html = '<img src="https://cdn.example.com/x.png" alt="x" />';
    expect(sanitizeRichText(html)).toContain('src="https://cdn.example.com/x.png"');
  });

  it('strips paired <script> tags and their contents', () => {
    const html = 'before<script>alert(1)</script>after';
    expect(sanitizeRichText(html)).not.toContain('<script');
    expect(sanitizeRichText(html)).not.toContain('alert(1)');
    expect(sanitizeRichText(html)).toContain('before');
    expect(sanitizeRichText(html)).toContain('after');
  });

  it('strips unpaired/self-closing <script> tags', () => {
    const html = 'before<script src="evil.js" />after';
    expect(sanitizeRichText(html)).not.toContain('<script');
  });

  it('strips <style>, <iframe>, <object>, <embed>, <form>, <input>', () => {
    for (const tag of ['style', 'iframe', 'object', 'embed', 'form', 'input']) {
      const html = `a<${tag}>b</${tag}>c`;
      const out = sanitizeRichText(html);
      expect(out).not.toContain(`<${tag}`);
      // The inner text of <style> should not survive either.
      if (tag === 'style') {
        expect(out).not.toContain('b');
      }
    }
  });

  it('strips inline event handlers (onclick, onerror, onload, ...)', () => {
    const cases = [
      '<a href="#" onclick="evil()">x</a>',
      '<img src="x" onerror="alert(1)" />',
      '<div onmouseover="bad">y</div>',
      // unquoted
      '<img src="x" onerror=alert(1) />',
    ];
    for (const html of cases) {
      const out = sanitizeRichText(html);
      expect(out).not.toMatch(/\son\w+\s*=/i);
    }
  });

  it('neutralises javascript: href and src', () => {
    const cases = [
      '<a href="javascript:alert(1)">x</a>',
      "<a href='javascript:alert(1)'>x</a>",
      '<a href=javascript:alert(1)>x</a>',
      '<img src="javascript:alert(1)" />',
      '<iframe src="javascript:alert(1)"></iframe>',
    ];
    for (const html of cases) {
      const out = sanitizeRichText(html);
      expect(out.toLowerCase()).not.toMatch(/href\s*=\s*["']?javascript:/i);
      expect(out.toLowerCase()).not.toMatch(/src\s*=\s*["']?javascript:/i);
    }
  });

  it('neutralises data: URLs (SVG XSS vector)', () => {
    // data:image/svg+xml can carry inline <script>.
    const html = '<img src="data:image/svg+xml;base64,PHN2ZyB..." />';
    const out = sanitizeRichText(html);
    expect(out.toLowerCase()).not.toMatch(/src\s*=\s*["']?data:/i);
  });

  it('neutralises vbscript: URLs', () => {
    const html = '<a href="vbscript:msgbox(1)">x</a>';
    const out = sanitizeRichText(html);
    expect(out.toLowerCase()).not.toMatch(/vbscript:/i);
  });

  it('strips the srcset attribute (used to smuggle payloads)', () => {
    const html = '<img src="ok.png" srcset="evil.png 1x" />';
    const out = sanitizeRichText(html);
    expect(out).not.toMatch(/srcset/i);
  });

  it('removes disallowed tags while keeping inner text', () => {
    const html = '<custom-tag>kept</custom-tag>';
    const out = sanitizeRichText(html);
    expect(out).toContain('kept');
    expect(out).not.toContain('custom-tag');
  });

  it('keeps figure/figcaption with caption', () => {
    const html = '<figure><img src="x.png" /><figcaption>Caption</figcaption></figure>';
    const out = sanitizeRichText(html);
    expect(out).toContain('<figure>');
    expect(out).toContain('<figcaption>');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeRichText('   <p>hi</p>   ')).toBe('<p>hi</p>');
  });

  it('does not crash on extreme input', () => {
    // 1MB of <p>. We just need it to not throw and to be bounded.
    const huge = '<p>x</p>'.repeat(100_000);
    const out = sanitizeRichText(huge);
    expect(out.length).toBeGreaterThan(0);
  });

  it('handles case variations of script tag', () => {
    const html = '<SCRIPT>alert(1)</SCRIPT>';
    const out = sanitizeRichText(html);
    expect(out).not.toMatch(/<script/i);
  });

  it('strips multiple nested event handlers in one tag', () => {
    const html = '<a href="#" onclick="x()" onmouseover="y()">link</a>';
    const out = sanitizeRichText(html);
    expect(out).not.toMatch(/\son\w+\s*=/i);
  });
});

describe('sanitizeRichText — obfuscated URL schemes', () => {
  // Regression: the scheme regex used to run on the RAW attribute value, so
  // "java&#x73;cript:alert(1)" (which the browser decodes to a real
  // javascript: URL before the href is interpreted) sailed straight through.
  it('neutralises entity-encoded javascript: URLs in href', () => {
    const html = '<a href="java&#x73;cript:alert(1)">x</a>';
    const out = sanitizeRichText(html);
    expect(out).not.toContain('javascript');
    expect(out).not.toContain('java&#x73;cript');
    expect(out).toContain('href="#"');
  });

  it('neutralises decimal-entity and hex-entity data: URLs in src', () => {
    const html = '<img src="&#x64;ata:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+" />';
    const out = sanitizeRichText(html);
    expect(out).not.toContain('data:');
    expect(out).toContain('src="#"');
  });

  it('neutralises control-character-padded javascript: URLs', () => {
    const html = '<a href="&#9;javascript:alert(1)">x</a>';
    const out = sanitizeRichText(html);
    expect(out).not.toContain('javascript');
    expect(out).toContain('href="#"');
  });

  it('neutralises vbscript: URLs, quoted and unquoted', () => {
    expect(sanitizeRichText('<a href="vbscript:msgbox(1)">x</a>')).toContain('href="#"');
    expect(sanitizeRichText('<a href=vbscript:msgbox(1)>x</a>')).toContain('href="#"');
  });

  it('leaves safe URLs alone (http/https/relative/uploads)', () => {
    const safe = '<a href="https://example.com">a</a><a href="/products/x">b</a><img src="/uploads/p/1/thumb.webp" />';
    expect(sanitizeRichText(safe)).toBe(safe);
  });
});
