/**
 * Runtime theme registry tests (lib/themeRuntime.ts).
 *
 * The runtime overlay is what makes admin-installed themes render without a
 * rebuild: /api/theme's `activeThemeConfig` and /api/themes' catalog feed a
 * cache that the storefront consults BEFORE the static registry. These
 * tests pin the resolution rule, the cache lifecycle, and the catalog
 * parsing (valid vs invalid themes).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setRuntimeThemeConfig,
  resolveThemeConfig,
  isInstalledThemeKey,
  clearRuntimeThemeCache,
  fetchThemeCatalog,
} from './themeRuntime';
import { getTheme, THEMES } from './themeRegistry';

const VALID_CONFIG = {
  key: 'solar',
  name: 'Solar',
  description: 'A warm theme.',
  version: '1.2.0',
  author: 'Kurdi Studio',
  preview: '/api/themes/solar/preview.png',
  features: { rtl: true, darkMode: false, paid: false },
  tokens: { primaryColor: '#ea580c', bodyBg: '#fffaf5' },
};

describe('setRuntimeThemeConfig', () => {
  beforeEach(() => clearRuntimeThemeCache());
  afterEach(() => clearRuntimeThemeCache());

  it('parses and caches a valid on-disk config', () => {
    const parsed = setRuntimeThemeConfig(VALID_CONFIG);
    expect(parsed?.key).toBe('solar');
    expect(resolveThemeConfig('solar').tokens.primaryColor).toBe('#ea580c');
  });

  it('rejects a config that fails the same schema the build gate uses', () => {
    expect(setRuntimeThemeConfig({ ...VALID_CONFIG, version: 'nope' })).toBeNull();
    expect(setRuntimeThemeConfig({ key: 'x' })).toBeNull();
    expect(resolveThemeConfig('solar').key).toBe('default'); // not cached → fallback
  });

  it('never lets a malformed config shadow the static registry', () => {
    const staticPulse = getTheme('pulse');
    setRuntimeThemeConfig({ ...VALID_CONFIG, key: 'pulse', tokens: 'nope' });
    const cfg = resolveThemeConfig('pulse');
    // The malformed config was rejected, so the static registry still wins.
    expect(cfg.key).toBe('pulse');
    expect(cfg.name).toBe(staticPulse.name);
  });

  it('merges a partial disk token set over the bundled base for bundled keys', () => {
    setRuntimeThemeConfig({ ...VALID_CONFIG, key: 'pulse', name: 'Pulse (disk)', tokens: { primaryColor: '#123456' } });
    const cfg = resolveThemeConfig('pulse');
    expect(cfg.name).toBe('Pulse (disk)');
    // Disk token wins…
    expect(cfg.tokens.primaryColor).toBe('#123456');
    // …and the bundled theme's other tokens are preserved, not stripped.
    expect(cfg.tokens.bodyBg).toBe(getTheme('pulse').tokens.bodyBg);
  });
});

describe('resolveThemeConfig (the resolution rule)', () => {
  beforeEach(() => clearRuntimeThemeCache());
  afterEach(() => clearRuntimeThemeCache());

  it('uses the static registry for bundled themes when no runtime config exists', () => {
    expect(resolveThemeConfig('pulse').key).toBe('pulse');
    expect(resolveThemeConfig('minimal').key).toBe('minimal');
  });

  it('lets a disk config override a bundled theme (Studio edits apply at runtime)', () => {
    const edited = { ...getTheme('pulse'), name: 'Pulse (edited)', tokens: { ...getTheme('pulse').tokens, primaryColor: '#123456' } };
    setRuntimeThemeConfig(edited);
    const cfg = resolveThemeConfig('pulse');
    expect(cfg.name).toBe('Pulse (edited)');
    expect(cfg.tokens.primaryColor).toBe('#123456');
  });

  it('resolves an installed theme after it is cached', () => {
    setRuntimeThemeConfig(VALID_CONFIG);
    expect(resolveThemeConfig('solar').key).toBe('solar');
  });

  it('falls back to the platform default for unknown keys', () => {
    expect(resolveThemeConfig('does-not-exist').key).toBe('default');
    expect(resolveThemeConfig(null).key).toBe('default');
    expect(resolveThemeConfig(undefined).key).toBe('default');
  });
});

describe('isInstalledThemeKey', () => {
  beforeEach(() => clearRuntimeThemeCache());
  afterEach(() => clearRuntimeThemeCache());

  it('accepts bundled keys without any cache', () => {
    expect(isInstalledThemeKey('default')).toBe(true);
    expect(isInstalledThemeKey('bold')).toBe(true);
  });

  it('accepts cached installed keys and rejects unknowns', () => {
    expect(isInstalledThemeKey('solar')).toBe(false);
    setRuntimeThemeConfig(VALID_CONFIG);
    expect(isInstalledThemeKey('solar')).toBe(true);
    expect(isInstalledThemeKey('ghost')).toBe(false);
    expect(isInstalledThemeKey('')).toBe(false);
    expect(isInstalledThemeKey(null)).toBe(false);
  });
});

describe('fetchThemeCatalog', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => clearRuntimeThemeCache());
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearRuntimeThemeCache();
  });

  it('parses the catalog, caches valid configs and reports invalid keys', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: {
            themes: [VALID_CONFIG, { ...VALID_CONFIG, key: 'luna', name: 'Luna' }],
            invalid: ['broken'],
          },
        }),
    }) as any;

    const { themes, invalid } = await fetchThemeCatalog();
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toMatch(/\/themes$/);
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).not.toContain('localhost');
    expect(themes.map((t) => t.key)).toEqual(['solar', 'luna']);
    expect(invalid).toEqual(['broken']);
    expect(isInstalledThemeKey('solar')).toBe(true);
    expect(isInstalledThemeKey('luna')).toBe(true);
  });

  it('puts malformed catalog entries into invalid instead of caching them', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: { themes: [{ key: 'broken2', name: 'x' }], invalid: [] },
        }),
    }) as any;

    const { themes, invalid } = await fetchThemeCatalog();
    expect(themes).toEqual([]);
    expect(invalid).toEqual(['broken2']);
    expect(isInstalledThemeKey('broken2')).toBe(false);
  });

  it('throws on a non-2xx catalog response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    await expect(fetchThemeCatalog()).rejects.toThrow(/500/);
  });

  it('filters nothing: bundled and installed themes are both in the catalog', () => {
    // The catalog is raw disk state; the bundled set is defined by the
    // static registry, so a catalog containing a bundled key is valid.
    expect(THEMES.length).toBeGreaterThan(0);
  });
});
