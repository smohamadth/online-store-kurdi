/**
 * serverLocale.resolveRequestLocale - server-side locale resolution.
 *
 * The root layout (app/layout.tsx) renders <html lang dir> on the very
 * first byte, so the chosen locale has to come from somewhere a server
 * component can read - a cookie or the Accept-Language header. The
 * priority order is:
 *
 *   1. `cms.lang` cookie set by a future i18n rewrite
 *   2. The primary subtag of the first Accept-Language tag we support
 *   3. English / LTR (default)
 *
 * Pinned by tests so the contract can't drift: a visitor who set `ku`
 * on their previous visit must come back to a Kurdish page even if their
 * browser is currently sending only `en-US`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `cookies()` and `headers()` from `next/headers` are request-scoped
// APIs that throw if called outside a request. Mock them per-test so
// the helper sees whatever cookie + header pair the scenario wants.
const cookieStore: Record<string, string> = {};
const headerStore: Record<string, string> = {};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const v = cookieStore[name];
      return v === undefined ? undefined : { name, value: v };
    },
  }),
  headers: async () => ({
    get: (name: string) => headerStore[name.toLowerCase()] ?? null,
  }),
}));

import { resolveRequestLocale, SUPPORTED_LOCALES } from '@/lib/serverLocale';

beforeEach(() => {
  for (const k of Object.keys(cookieStore)) delete cookieStore[k];
  for (const k of Object.keys(headerStore)) delete headerStore[k];
});

describe('resolveRequestLocale', () => {
  it('returns the cookie value when set, ignoring Accept-Language', async () => {
    cookieStore['cms.lang'] = 'ku';
    headerStore['accept-language'] = 'en-US,en;q=0.9';
    const result = await resolveRequestLocale();
    expect(result).toEqual({ code: 'ku', dir: 'rtl' });
  });

  it('uses the first supported tag in Accept-Language', async () => {
    headerStore['accept-language'] = 'ku,en-US;q=0.8';
    const result = await resolveRequestLocale();
    expect(result).toEqual({ code: 'ku', dir: 'rtl' });
  });

  it('handles a region tag - "ar-IQ" matches ar/rtl', async () => {
    headerStore['accept-language'] = 'ar-IQ,en;q=0.5';
    const result = await resolveRequestLocale();
    expect(result).toEqual({ code: 'ar', dir: 'rtl' });
  });

  it('handles quality-value hints by reading the tag regardless of q', async () => {
    // Browsers send `ar;q=0.9` to mean "I accept Arabic with preference 0.9";
    // it should still be treated as "I want Arabic" for locale purposes.
    headerStore['accept-language'] = 'ar;q=0.9,en-US;q=0.8';
    const result = await resolveRequestLocale();
    expect(result).toEqual({ code: 'ar', dir: 'rtl' });
  });

  it('falls through to English when nothing matches', async () => {
    headerStore['accept-language'] = 'fr-FR,de-DE';
    const result = await resolveRequestLocale();
    expect(result).toEqual({ code: 'en', dir: 'ltr' });
  });

  it('falls through to English when no headers at all', async () => {
    const result = await resolveRequestLocale();
    expect(result).toEqual({ code: 'en', dir: 'ltr' });
  });

  it('ignores a cookie that names an unsupported code', async () => {
    // An attacker (or a stale cookie from a removed language) shouldn't
    // be able to set a fake lang attribute on <html>; we just fall through
    // to Accept-Language, then English.
    cookieStore['cms.lang'] = 'xx';
    headerStore['accept-language'] = 'ar';
    const result = await resolveRequestLocale();
    expect(result).toEqual({ code: 'ar', dir: 'rtl' });
  });

  it('cookie wins over Accept-Language even when the cookie is LTR', async () => {
    // Make sure cookie priority is not accidentally skipping the LTR
    // locales - someone whose cookie says tr but whose browser is
    // Arabic should still get Turkish (their saved choice).
    cookieStore['cms.lang'] = 'tr';
    headerStore['accept-language'] = 'ar';
    const result = await resolveRequestLocale();
    expect(result).toEqual({ code: 'tr', dir: 'ltr' });
  });
});

describe('SUPPORTED_LOCALES', () => {
  it('lists exactly the four supported codes', () => {
    expect(SUPPORTED_LOCALES.map((l) => l.code).sort()).toEqual(
      ['ar', 'en', 'ku', 'tr'].sort(),
    );
  });

  it('marks ku and ar as RTL, en and tr as LTR', () => {
    const byCode = Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l.code, l.dir]));
    expect(byCode.en).toBe('ltr');
    expect(byCode.tr).toBe('ltr');
    expect(byCode.ku).toBe('rtl');
    expect(byCode.ar).toBe('rtl');
  });
});
