/**
 * ThemeProvider + useTheme.
 *
 * The provider has three behaviours worth testing:
 *   1. Initial render uses the shipped DEFAULT_THEME while loading.
 *   2. It fetches GET /theme on mount; on success it merges the response
 *      into state and caches it in localStorage.
 *   3. On failure (network or non-2xx) it logs once and keeps whatever
 *      was last cached (or DEFAULT_THEME if nothing was cached).
 *   4. Reload re-runs the fetch.
 *   5. A 'themeChange' window event triggers a reload.
 *
 * themeToCssVars is a pure helper that the <style> tag injects - it must
 * cover all the fields the admin can override.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ThemeProvider, useTheme, DEFAULT_THEME, FONT_LABELS, FONT_STACKS, themeToCssVars } from '@/lib/theme';
import {
  THEMES,
  FALLBACK_THEME_KEY,
  getTheme,
  getDefaultTheme,
  isInstalledTheme,
  listThemeKeys,
} from '@/lib/themeRegistry';

function Probe() {
  const { theme, loading, reload } = useTheme();
  return (
    <div>
      <pre data-testid="snap">{JSON.stringify({ primary: theme.primaryColor, announcement: theme.announcementText, showAnnouncement: theme.showAnnouncement, loading })}</pre>
      <button onClick={reload}>reload</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

function readSnap() {
  return JSON.parse(screen.getByTestId('snap').textContent || '{}');
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses DEFAULT_THEME as the initial state', async () => {
    await act(async () => {
      renderProbe();
    });
    // After mount the fetch resolved (the default fetch stub returns
    // 404), so loading flips back to false. The default primary colour
    // is still in place because nothing overrode it.
    expect(readSnap().primary).toBe(DEFAULT_THEME.primaryColor);
    expect(readSnap().loading).toBe(false);
  });

  it('replaces the theme when /theme returns data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { primaryColor: '#ff00ff', announcementText: 'Hello!' } }),
    }) as any;

    renderProbe();
    await waitFor(() => {
      const s = readSnap();
      expect(s.primary).toBe('#ff00ff');
      expect(s.announcement).toBe('Hello!');
      expect(s.loading).toBe(false);
    });
    // Cached for next paint.
    expect(JSON.parse(localStorage.getItem('themeSettings')!)).toMatchObject({
      primaryColor: '#ff00ff',
    });
  });

  it('falls back to defaults and logs when /theme returns non-2xx', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ data: null }),
    }) as any;

    renderProbe();
    await waitFor(() => {
      expect(readSnap().loading).toBe(false);
    });
    expect(readSnap().primary).toBe(DEFAULT_THEME.primaryColor);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
    errSpy.mockRestore();
  });

  it('falls back to cached theme on network error and logs once', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('themeSettings', JSON.stringify({ primaryColor: '#abcdef' }));
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    renderProbe();
    await waitFor(() => {
      expect(readSnap().loading).toBe(false);
    });
    expect(readSnap().primary).toBe('#abcdef');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Could not reach'), expect.any(Error));
    errSpy.mockRestore();
  });

  it('survives malformed cached theme JSON', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('themeSettings', '{not json');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any;

    renderProbe();
    await waitFor(() => {
      expect(readSnap().loading).toBe(false);
    });
    // The JSON.parse is wrapped in try/catch in the source, so this is a
    // quiet fallback to DEFAULT_THEME.
    expect(readSnap().primary).toBe(DEFAULT_THEME.primaryColor);
    errSpy.mockRestore();
  });

  it('reload() re-runs the fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { primaryColor: '#111111' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { primaryColor: '#222222' } }),
      });
    globalThis.fetch = fetchMock as any;

    renderProbe();
    await waitFor(() => expect(readSnap().primary).toBe('#111111'));

    await act(async () => {
      screen.getByText('reload').click();
    });
    await waitFor(() => expect(readSnap().primary).toBe('#222222'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a window "themeChange" event triggers a reload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { primaryColor: '#deadbe' } }),
    });
    globalThis.fetch = fetchMock as any;

    renderProbe();
    await waitFor(() => expect(readSnap().primary).toBe('#deadbe'));

    const before = fetchMock.mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event('themeChange'));
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('paints from cache before the network completes', async () => {
    localStorage.setItem('themeSettings', JSON.stringify({ primaryColor: '#00ff00' }));
    // A fetch that never resolves.
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as any;

    renderProbe();
    // Initial render reads the cache synchronously inside the effect. The
    // loading flag is still true because load() is in flight, but the
    // primary colour is already the cached value.
    expect(readSnap().primary).toBe('#00ff00');
    expect(readSnap().loading).toBe(true);
  });
});

describe('themeToCssVars', () => {
  it('emits a CSS block that names every themeable token', () => {
    const css = themeToCssVars(DEFAULT_THEME);
    // Core brand + surface tokens.
    expect(css).toContain('--brand: ' + DEFAULT_THEME.primaryColor);
    expect(css).toContain('--accent: ' + DEFAULT_THEME.accentColor);
    expect(css).toContain('--body-bg: ' + DEFAULT_THEME.bodyBg);
    expect(css).toContain('--body-text: ' + DEFAULT_THEME.bodyText);
    expect(css).toContain('--header-bg: ' + DEFAULT_THEME.headerBg);
    expect(css).toContain('--footer-bg: ' + DEFAULT_THEME.footerBg);
    expect(css).toContain('--price: ' + DEFAULT_THEME.priceColor);
    expect(css).toContain('--sale: ' + DEFAULT_THEME.saleColor);
  });

  it('maps each cardShadow level to the matching shadow value', () => {
    const soft = themeToCssVars({ ...DEFAULT_THEME, cardShadow: 'soft' });
    const strong = themeToCssVars({ ...DEFAULT_THEME, cardShadow: 'strong' });
    const none = themeToCssVars({ ...DEFAULT_THEME, cardShadow: 'none' });

    expect(soft).toContain('--shadow: 0 1px 3px rgba(0,0,0,0.06)');
    expect(strong).toContain('--shadow: 0 10px 30px rgba(0,0,0,0.12)');
    expect(none).toContain('--shadow: none');
  });

  it('falls back to "soft" shadow for an unknown cardShadow value', () => {
    // @ts-expect-error - intentionally passing an invalid value to test fallback
    const css = themeToCssVars({ ...DEFAULT_THEME, cardShadow: 'wavy' });
    expect(css).toContain('--shadow: 0 1px 3px rgba(0,0,0,0.06)');
  });

  it('emits the font-family for the chosen font stack', () => {
    const inter = themeToCssVars({ ...DEFAULT_THEME, fontFamily: 'inter' });
    expect(inter).toContain('--font: Inter');

    const mono = themeToCssVars({ ...DEFAULT_THEME, fontFamily: 'mono' });
    expect(mono).toContain('--font:');
    expect(mono).toContain('SF Mono');
  });

  it('falls back to the system stack for an unknown font key', () => {
    const css = themeToCssVars({ ...DEFAULT_THEME, fontFamily: 'comic-sans' });
    expect(css).toContain('--font:');
    expect(css).toContain('BlinkMacSystemFont');
  });

  describe('Kurdish fonts', () => {
    it('offers the professional Kurdish/Arabic-script faces', () => {
      for (const key of ['vazirmatn', 'noto-naskh', 'noto-kufi', 'readex', 'cairo', 'tajawal']) {
        expect(FONT_STACKS[key]).toBeTruthy();
        expect(FONT_LABELS[key]).toBeTruthy();
      }
    });

    it('falls back to the Kurdish webfonts for Arabic-script text in EVERY stack', () => {
      // Per-glyph fallback: even "system" must render کوردی with the
      // self-hosted Kurdish faces, not the OS substitution.
      for (const stack of Object.values(FONT_STACKS)) {
        expect(stack).toContain('var(--font-vazirmatn)');
      }
    });

    it('emits the chosen Kurdish font into the --font variable', () => {
      const css = themeToCssVars({ ...DEFAULT_THEME, fontFamily: 'vazirmatn' });
      expect(css).toContain('--font: var(--font-vazirmatn)');
    });

    it('ships the default theme with a professional Kurdish font', () => {
      expect(DEFAULT_THEME.fontFamily).toBe('vazirmatn');
    });
  });

  describe('Kurdish font contract (bundled files ↔ CSS vars ↔ stacks)', () => {
    // The layout imports @fontsource CSS that declares the family
    // names, globals.css declares --font-* variables pointing at those
    // names, and the theme stacks reference the variables. If ANY link
    // in that chain drifts (a rename in a dependency upgrade, a typo in
    // a variable), the browser silently falls back to the OS font and
    // the whole feature quietly does nothing. These tests read the
    // ACTUAL installed package CSS (same source-scanning technique as
    // the rtl ratchet) to pin every link.

    const requireFromTest = createRequire(import.meta.url);

    // The @font-face family declared by the installed package's Arabic
    // subset stylesheet - what the browser will actually register.
    const declaredFamily = (pkg: string) => {
      const css = readFileSync(requireFromTest.resolve(`${pkg}/arabic-400.css`), 'utf8');
      return css.match(/font-family:\s*'([^']+)'/)?.[1] ?? null;
    };

    it.each([
      ['@fontsource/vazirmatn', 'Vazirmatn'],
      ['@fontsource/noto-naskh-arabic', 'Noto Naskh Arabic'],
      ['@fontsource/noto-kufi-arabic', 'Noto Kufi Arabic'],
      ['@fontsource/readex-pro', 'Readex Pro'],
      ['@fontsource/cairo', 'Cairo'],
      ['@fontsource/tajawal', 'Tajawal'],
    ])('%s ships the %s face the theme expects', (pkg, name) => {
      expect(declaredFamily(pkg)).toBe(name);
    });

    it('globals.css declares one --font-* variable per face with the exact family name', () => {
      const globals = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');
      const pairs: [string, string][] = [
        ['--font-vazirmatn', 'Vazirmatn'],
        ['--font-noto-naskh-arabic', 'Noto Naskh Arabic'],
        ['--font-noto-kufi-arabic', 'Noto Kufi Arabic'],
        ['--font-readex-pro', 'Readex Pro'],
        ['--font-cairo', 'Cairo'],
        ['--font-tajawal', 'Tajawal'],
      ];
      for (const [variable, family] of pairs) {
        expect(globals, `${variable} must point at the '${family}' face`).toContain(`${variable}: '${family}';`);
      }
    });

    it('every var(--font-*) referenced by the theme stacks is declared in globals.css', () => {
      const globals = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');
      const referenced = new Set<string>();
      for (const stack of Object.values(FONT_STACKS)) {
        Array.from(stack.matchAll(/var\((--font-[a-z-]+)\)/g)).forEach((m) => referenced.add(m[1]));
      }
      expect(referenced.size).toBeGreaterThan(0); // the stacks really do use the faces
      Array.from(referenced).forEach((variable) => {
        expect(globals, `theme stacks reference ${variable} but globals.css never declares it`).toContain(variable);
      });
    });

    it('the layout actually imports the fontsource stylesheets it relies on', () => {
      // A deleted import would leave the variables dangling (declared in
      // globals.css, never @font-faced). Pin the exact set of imported
      // packages (compare sorted arrays - arrayContaining needs an array,
      // not a Set).
      const layout = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8');
      const imported = Array.from(layout.matchAll(/@fontsource\/([a-z0-9-]+)\/(arabic|latin)-\d+\.css/g), (m) => m[1]);
      expect(imported.length).toBeGreaterThan(0);
      expect(Array.from(new Set(imported)).sort()).toEqual(
        ['vazirmatn', 'noto-naskh-arabic', 'noto-kufi-arabic', 'readex-pro', 'cairo', 'tajawal'].sort(),
      );
    });
  });

  it('emits the numeric scales with px units', () => {
    const css = themeToCssVars({
      ...DEFAULT_THEME,
      baseFontSize: 18,
      radius: 12,
      buttonRadius: 6,
      containerWidth: 1280,
      headingWeight: 700,
    });
    expect(css).toContain('--font-size: 18px');
    expect(css).toContain('--radius: 12px');
    expect(css).toContain('--btn-radius: 6px');
    expect(css).toContain('--container: 1280px');
    expect(css).toContain('--heading-weight: 700');
  });
});

/**
 * Theme registry tests.
 *
 * The registry is the source of truth for "what themes are
 * installed." The whole multi-theme system depends on it
 * being correct.
 */
describe('themeRegistry', () => {
  it('includes both installed themes', () => {
    const keys = THEMES.map((t) => t.key);
    expect(keys).toContain('default');
    expect(keys).toContain('minimal');
  });

  it('default theme is the fallback', () => {
    expect(FALLBACK_THEME_KEY).toBe('default');
  });

  it('getDefaultTheme() returns the default theme', () => {
    const t = getDefaultTheme();
    expect(t.key).toBe('default');
  });

  it('getTheme("minimal") returns the minimal theme', () => {
    const t = getTheme('minimal');
    expect(t.key).toBe('minimal');
  });

  it('getTheme() with an unknown key falls back to default', () => {
    const t = getTheme('does-not-exist');
    expect(t.key).toBe('default');
  });

  it('getTheme(null) falls back to default', () => {
    expect(getTheme(null).key).toBe('default');
  });

  it('getTheme(undefined) falls back to default', () => {
    expect(getTheme(undefined).key).toBe('default');
  });

  it('isInstalledTheme returns true for installed keys', () => {
    expect(isInstalledTheme('default')).toBe(true);
    expect(isInstalledTheme('minimal')).toBe(true);
  });

  it('isInstalledTheme returns false for unknown keys', () => {
    expect(isInstalledTheme('foo')).toBe(false);
    expect(isInstalledTheme('')).toBe(false);
    expect(isInstalledTheme(null)).toBe(false);
    expect(isInstalledTheme(undefined)).toBe(false);
  });

  it('listThemeKeys returns all installed keys', () => {
    expect(listThemeKeys()).toContain('default');
    expect(listThemeKeys()).toContain('minimal');
  });

  it('the default theme is free', () => {
    const t = THEMES.find((th) => th.key === 'default');
    expect(t?.features.paid).toBe(false);
  });

  it('the minimal theme is free (bundled themes are selectable)', () => {
    const t = THEMES.find((th) => th.key === 'minimal');
    expect(t?.features.paid).toBe(false);
  });

  it('the minimal theme uses a serif font and zero button radius', () => {
    const t = THEMES.find((th) => th.key === 'minimal')!;
    expect(t.tokens.fontFamily).toBe('georgia');
    expect(t.tokens.buttonRadius).toBe(0);
    expect(t.tokens.cardShadow).toBe('none');
    expect(t.tokens.productsPerRow).toBe(3);
  });

  it('the minimal theme disables marketing chrome', () => {
    const t = THEMES.find((th) => th.key === 'minimal')!;
    expect(t.tokens.showTrustBar).toBe(false);
    expect(t.tokens.showTestimonials).toBe(false);
    expect(t.tokens.showStats).toBe(false);
    expect(t.tokens.showDealCountdown).toBe(false);
    expect(t.tokens.showNewArrivals).toBe(false);
  });

  it('the minimal theme keeps the content sections (newsletter, categories, featured)', () => {
    const t = THEMES.find((th) => th.key === 'minimal')!;
    expect(t.tokens.showNewsletter).toBe(true);
    expect(t.tokens.showCategories).toBe(true);
    expect(t.tokens.showFeatured).toBe(true);
  });

  it('the minimal theme declares section overrides for hero, featured, categories', () => {
    const t = THEMES.find((th) => th.key === 'minimal')!;
    expect(t.sections).toBeDefined();
    expect(Object.keys(t.sections!)).toEqual(
      expect.arrayContaining(['hero', 'featured', 'categories']),
    );
  });
});

/**
 * Bold theme tests.
 *
 * The Bold theme is the third installed theme — image-first,
 * dark by default, marketing chrome on. It exists to prove
 * the multi-theme system holds for a third design that's
 * substantially different from the default and the Minimal
 * theme.
 */
describe('themeRegistry — Bold theme', () => {
  it('is in the registry', () => {
    expect(THEMES.map((t) => t.key)).toContain('bold');
  });

  it('is free so merchants can activate it without a license', () => {
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.features.paid).toBe(false);
  });

  it('declares dark-mode support', () => {
    // The "dark mode" feature flag is informational for now
    // (the platform doesn't yet have a runtime toggle), but
    // the Bold theme is the first one to opt in. Pinning
    // the flag means a future "actually implement dark mode"
    // PR can find this via the test.
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.features.darkMode).toBe(true);
  });

  it('uses a near-black body background (dark mode default)', () => {
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.tokens.bodyBg).toBe('#0a0a0a');
  });

  it('uses an accent-coloured price (yellow on dark)', () => {
    // The price colour is what catches the eye. Bold uses
    // a yellow accent so prices pop on the dark background.
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.tokens.priceColor).toBe('#facc15');
  });

  it('uses a heavy display font (rounded / Trebuchet) with heading weight 900', () => {
    // Bold's signature: heavy + heavy. Font weight 900 is
    // the heaviest available.
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.tokens.fontFamily).toBe('rounded');
    expect(t.tokens.headingWeight).toBe(900);
  });

  it('uses zero border-radius (no rounded corners anywhere)', () => {
    // Where Minimal is rounded with `radius: 2`, Bold is
    // hard-edged: 0px on every corner. Pinning the values
    // catches a future refactor that accidentally bumps
    // either of them.
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.tokens.radius).toBe(0);
    expect(t.tokens.buttonRadius).toBe(0);
  });

  it('uses strong card shadow (high contrast against dark bg)', () => {
    // The default theme uses 'soft' shadows; Minimal uses
    // 'none'. Bold's high-contrast dark cards need a strong
    // shadow to separate from the background.
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.tokens.cardShadow).toBe('strong');
  });

  it('shows 2 products per row (large, image-focused cards)', () => {
    // Bold's 2-col grid is the visual statement. The default
    // is 4; Minimal is 3. Pinning the 2 ensures the
    // editorial-grid feel.
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.tokens.productsPerRow).toBe(2);
  });

  it('uses a wider content container (1400px) than the default', () => {
    // The default is 1200px; Minimal is 960px. Bold's
    // 1400px gives the wide hero and the 2-col product
    // grid room to breathe.
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.tokens.containerWidth).toBe(1400);
  });

  it('keeps every marketing section on (Bold stores want to scream)', () => {
    // Where Minimal turns everything off, Bold turns
    // everything on. The contrast is the point.
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.tokens.showTrustBar).toBe(true);
    expect(t.tokens.showTestimonials).toBe(true);
    expect(t.tokens.showStats).toBe(true);
    expect(t.tokens.showDealCountdown).toBe(true);
    expect(t.tokens.showCategories).toBe(true);
    expect(t.tokens.showFeatured).toBe(true);
    expect(t.tokens.showNewArrivals).toBe(true);
    expect(t.tokens.showNewsletter).toBe(true);
  });

  it('declares section overrides for hero, featured, categories', () => {
    const t = THEMES.find((th) => th.key === 'bold')!;
    expect(t.sections).toBeDefined();
    expect(Object.keys(t.sections!)).toEqual(
      expect.arrayContaining(['hero', 'featured', 'categories']),
    );
  });
});

/**
 * Cross-theme assertions.
 *
 * Properties that should hold across every installed theme
 * regardless of design direction. If a future theme breaks
 * one of these, the test is a sign that the property is
 * no longer universal — which might be intentional, but
 * should be a deliberate decision.
 */
describe('themeRegistry — universal properties', () => {
  it('every theme has a unique key', () => {
    const keys = THEMES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every theme has a non-empty name and description', () => {
    for (const t of THEMES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('every theme has a semver version', () => {
    for (const t of THEMES) {
      expect(t.version).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it('every theme declares a primary color', () => {
    for (const t of THEMES) {
      expect(typeof t.tokens.primaryColor).toBe('string');
      expect((t.tokens.primaryColor as string).length).toBeGreaterThan(0);
    }
  });
});

/**
 * tokensToTheme — the helper that flattens a ThemeConfig into
 * a runtime Theme. Pinned here because the function is now
 * exported (the preview provider uses it).
 *
 * The most important contract is the activeTheme guard: a
 * caller passing `activeTheme: 'foo'` via the customizations
 * spread must NOT be able to clobber the config's
 * authoritative `activeTheme.key`. The function strips
 * `activeTheme` from customizations before merging; this test
 * pins that behaviour so a future refactor can't
 * accidentally re-introduce the leak.
 */
describe('scrubCustomCss', () => {
  it('keeps ordinary CSS', async () => {
    const { scrubCustomCss } = await import('./theme');
    expect(scrubCustomCss('.hero{color:red}')).toBe('.hero{color:red}');
  });

  it('drops CSS that would break out of the style tag', async () => {
    const { scrubCustomCss } = await import('./theme');
    expect(scrubCustomCss('</style><script>alert(1)</script>')).toBeNull();
    expect(scrubCustomCss('body{background:url(javascript:alert(1))}')) .toBeNull();
    expect(scrubCustomCss('@import url(https://evil.example/x.css)')).toBeNull();
  });

  it('tokensToTheme never keeps dangerous customCss from customizations', async () => {
    const { tokensToTheme } = await import('./theme');
    const merged = tokensToTheme(getTheme('default'), {
      customCss: '</style><script>alert(1)</script>',
    });
    expect(merged.customCss).toBeNull();
  });
});

describe('tokensToTheme — activeTheme guard', () => {
  it('uses the config key when no customizations are passed', async () => {
    const { tokensToTheme } = await import('./theme');
    const config = getTheme('minimal');
    const merged = tokensToTheme(config);
    expect(merged.activeTheme).toBe('minimal');
  });

  it('uses the config key when the customizations try to override activeTheme', async () => {
    const { tokensToTheme } = await import('./theme');
    const config = getTheme('minimal');
    // Even when the customizations pass a different activeTheme,
    // the config's authoritative key wins. This is the bug fix:
    // a previous version of this function let the customizations
    // spread clobber the config.
    const merged = tokensToTheme(config, { activeTheme: 'default' as any });
    expect(merged.activeTheme).toBe('minimal');
  });

  it('still applies the rest of the customizations', async () => {
    const { tokensToTheme } = await import('./theme');
    const config = getTheme('default');
    const merged = tokensToTheme(config, {
      primaryColor: '#ff00ff',
      containerWidth: 999,
    });
    // Custom fields are applied…
    expect(merged.primaryColor).toBe('#ff00ff');
    expect(merged.containerWidth).toBe(999);
    // …but the activeTheme is still the config's.
    expect(merged.activeTheme).toBe('default');
  });
});
