import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const putSchema = z.object({
  languages: z.array(z.object({
    code: z.string().min(2).max(8).regex(/^[a-z][a-z0-9-]*$/i),
    name: z.string().min(1).max(80),
    dir: z.enum(['ltr', 'rtl']),
    flag: z.string().max(8).optional(),
    enabled: z.boolean(),
  })).min(1).max(40),
  strings: z.record(z.record(z.string().max(2000))).optional(),
});

describe('storefront i18n put schema', () => {
  it('accepts a manager-style overlay payload', () => {
    const parsed = putSchema.parse({
      languages: [{ code: 'en', name: 'English', dir: 'ltr', enabled: true }],
      strings: { en: { 'nav.home': 'Home' } },
    });
    expect(parsed.languages[0].code).toBe('en');
  });

  it('allows omitting strings so overlays are not wiped', () => {
    const parsed = putSchema.parse({
      languages: [{ code: 'ku', name: 'کوردی', dir: 'rtl', enabled: true }],
    });
    expect(parsed.strings).toBeUndefined();
  });

  it('rejects a one-character language code', () => {
    expect(() => putSchema.parse({
      languages: [{ code: 'x', name: 'X', dir: 'ltr', enabled: true }],
    })).toThrow();
  });
});
