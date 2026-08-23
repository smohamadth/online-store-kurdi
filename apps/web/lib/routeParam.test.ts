/**
 * routeParam.ts — re-encode a dynamic route segment for safe use in URLs.
 *
 * The bug this prevents: a `params.slug` like "کۆمپانیا" arrives as the
 * percent-encoded "%DA%A9%DB%86...". Calling encodeURIComponent on the
 * already-encoded string would re-encode the percent signs into "%25", and
 * the server would then look up the wrong slug.
 */
import { describe, it, expect } from 'vitest';
import { encodeRouteParam } from './routeParam';

describe('encodeRouteParam', () => {
  it('encodes an ASCII slug (idempotent for already-clean input)', () => {
    expect(encodeRouteParam('hello-world')).toBe('hello-world');
  });

  it('decodes then re-encodes a percent-encoded value', () => {
    // %DA%A9 = "ک", %DB%86 = "ۆ" in UTF-8 (two Kurdish characters).
    const out = encodeRouteParam('%DA%A9%DB%86');
    expect(out).toBe(encodeURIComponent('کۆ'));
  });

  it('handles a non-ASCII input that needs encoding', () => {
    expect(encodeRouteParam('کۆمپانیا')).toBe(encodeURIComponent('کۆمپانیا'));
  });

  it('falls back to the raw input on a malformed escape sequence', () => {
    // %zz is not a valid escape. decodeURIComponent throws, so the helper
    // returns the raw value to keep the URL somewhat usable.
    // The function then re-encodes the percent sign to %25.
    expect(encodeRouteParam('%zz')).toBe('%25zz');
  });

  it('returns the same value for input that is already plain ASCII', () => {
    const v = 'simple-slug';
    expect(encodeRouteParam(v)).toBe(v);
  });
});
