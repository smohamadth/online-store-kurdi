import { describe, it, expect } from 'vitest';
import { isPlatformBundledTheme, PLATFORM_BUNDLED_THEME_KEYS } from './themeBundled';

describe('isPlatformBundledTheme', () => {
  it('protects every shipped theme key', () => {
    for (const k of PLATFORM_BUNDLED_THEME_KEYS) {
      expect(isPlatformBundledTheme(k)).toBe(true);
    }
  });

  it('allows custom keys', () => {
    expect(isPlatformBundledTheme('my-brand')).toBe(false);
    expect(isPlatformBundledTheme('')).toBe(false);
    expect(isPlatformBundledTheme(null)).toBe(false);
  });
});
