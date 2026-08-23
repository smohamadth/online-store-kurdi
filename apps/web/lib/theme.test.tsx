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
import { render, screen, waitFor, act } from '@testing-library/react';
import { ThemeProvider, useTheme, DEFAULT_THEME, themeToCssVars } from '@/lib/theme';

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
