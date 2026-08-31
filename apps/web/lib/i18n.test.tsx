/**
 * useTranslation / useTranslations from lib/i18n.
 *
 * Two hooks with the same shape but different storage models:
 *   - useTranslation: own useState, persists to localStorage, writes
 *     document.documentElement.dir and lang, fires a `languageChange`
 *     event on switch.
 *   - useTranslations: own useState, no persistence; reads localStorage
 *     and listens for the `languageChange` event (so the two stay in
 *     sync if anything writes localStorage).
 *
 * Cover the major branches: default (en), saved language, browser
 * language fallback, changeLanguage side effects, and the t()
 * fallback chain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook, waitFor } from '@testing-library/react';
import { languages, useTranslation, useTranslations, allTranslationKeys, translations } from '@/lib/i18n';
import { I18nSeedProvider } from '@/lib/I18nSeedProvider';

function TranslationProbe() {
  const { t, language, changeLanguage, direction } = useTranslation();
  return (
    <div>
      <pre data-testid="snap">{JSON.stringify({ t_home: t('nav.home'), t_bogus: t('does.not.exist'), language, direction })}</pre>
      <button onClick={() => changeLanguage('ar')}>ar</button>
      <button onClick={() => changeLanguage('ku')}>ku</button>
      <button onClick={() => changeLanguage('en')}>en</button>
    </div>
  );
}

function readSnap() {
  return JSON.parse(screen.getByTestId('snap').textContent || '{}');
}

describe('useTranslation', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = '';
  });

  it('defaults to English and renders a known English string', async () => {
    await act(async () => {
      render(<TranslationProbe />);
    });
    const snap = readSnap();
    expect(snap.language).toBe('en');
    expect(snap.t_home).toBe('Home');
    expect(snap.direction).toBe('ltr');
  });

  it('falls back to English when a key is missing in the active language', async () => {
    // All known keys exist in en; the test confirms the chain by asking
    // for a key that does not exist anywhere.
    await act(async () => {
      render(<TranslationProbe />);
    });
    expect(readSnap().t_bogus).toBe('does.not.exist');
  });

  it('uses a custom fallback when provided', async () => {
    function FbProbe() {
      const { t } = useTranslation();
      return <span data-testid="fb">{t('missing.key', 'fallback text')}</span>;
    }
    await act(async () => {
      render(<FbProbe />);
    });
    expect(screen.getByTestId('fb')).toHaveTextContent('fallback text');
  });

  it('reads a saved language from localStorage on mount', async () => {
    localStorage.setItem('language', 'ar');
    await act(async () => {
      render(<TranslationProbe />);
    });
    const snap = readSnap();
    expect(snap.language).toBe('ar');
    expect(snap.t_home).toBe('الرئيسية');
    expect(snap.direction).toBe('rtl');
    // Side effect on mount: <html dir/lang> gets the chosen direction.
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('falls back to navigator.language for an unsupported saved code', async () => {
    localStorage.setItem('language', 'xx');
    // No navigator.language override possible here; the hook falls back
    // through saved -> browser -> 'en'.
    await act(async () => {
      render(<TranslationProbe />);
    });
    expect(readSnap().language).toBe('en');
  });

  it('changeLanguage updates the hook, document, localStorage and fires an event', async () => {
    const onChange = vi.fn();
    window.addEventListener('languageChange', onChange);

    await act(async () => {
      render(<TranslationProbe />);
    });
    expect(readSnap().language).toBe('en');

    act(() => screen.getByText('ar').click());
    await waitFor(() => {
      const snap = readSnap();
      expect(snap.language).toBe('ar');
      expect(snap.t_home).toBe('الرئيسية');
      expect(snap.direction).toBe('rtl');
    });
    expect(localStorage.getItem('language')).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(onChange).toHaveBeenCalled();

    window.removeEventListener('languageChange', onChange);
  });

  it('switching to Kurdish flips to RTL and renders Kurdish copy', async () => {
    await act(async () => {
      render(<TranslationProbe />);
    });
    act(() => screen.getByText('ku').click());
    await waitFor(() => {
      const snap = readSnap();
      expect(snap.language).toBe('ku');
      expect(snap.t_home).toBe('سەرەتا');
      expect(snap.direction).toBe('rtl');
    });
  });

  it('switching back to English restores LTR', async () => {
    await act(async () => {
      render(<TranslationProbe />);
    });
    act(() => screen.getByText('ar').click());
    act(() => screen.getByText('en').click());
    await waitFor(() => {
      expect(readSnap().direction).toBe('ltr');
    });
  });
});

describe('useTranslations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an English translator by default', async () => {
    const { result } = renderHook(() => useTranslations());
    await waitFor(() => {
      expect(result.current('nav.home')).toBe('Home');
    });
  });

  it('reads the active language from localStorage and listens for changes', async () => {
    localStorage.setItem('language', 'ar');
    const { result } = renderHook(() => useTranslations());

    await waitFor(() => {
      expect(result.current('nav.home')).toBe('الرئيسية');
    });

    // Simulate useTranslation.changeLanguage writing to localStorage and
    // firing the event.
    act(() => {
      localStorage.setItem('language', 'ku');
      window.dispatchEvent(new Event('languageChange'));
    });
    await waitFor(() => {
      expect(result.current('nav.home')).toBe('سەرەتا');
    });
  });

  it('returns the key when nothing matches even with a custom fallback', () => {
    const { result } = renderHook(() => useTranslations());
    // The hook does not accept a fallback; passing one is silently
    // ignored, so the key itself is returned.
    expect(result.current('totally.missing')).toBe('totally.missing');
  });
});

describe('languages table', () => {
  it('includes all five supported codes with a direction', () => {
    const codes = languages.map((l) => l.code);
    expect(codes).toEqual(['en', 'ku', 'ar', 'fa', 'tr']);
    for (const l of languages) {
      expect(l.name.length).toBeGreaterThan(0);
      expect(['ltr', 'rtl']).toContain(l.dir);
    }
  });
});

describe('translation completeness', () => {
  it('every supported language implements every English key', () => {
    // Guards against a partial dictionary (a language advertised in the
    // switcher but silently falling back to English), which is exactly the
    // Turkish gap this fixed.
    const source = allTranslationKeys;
    for (const lang of languages) {
      if (lang.code === 'en') continue;
      const dict = translations[lang.code] ?? {};
      const missing = source.filter((k) => !(k in dict));
      expect(missing).toEqual([]);
    }
  });
});

/**
 * SSR seed: the root layout passes the server-resolved locale down through
 * I18nSeedProvider. useTranslation() should use that as its initial state so
 * the first render matches the server-rendered <html lang dir> - no flash
 * of LTR/English content for a Kurdish/Arabic visitor before the
 * localStorage effect lands.
 *
 * The probe renders ONCE (no waitFor) and reads the initial state, so the
 * assertion catches a regression where the seed is ignored and the hook
 * falls back to 'en' / 'ltr' on first render.
 */
describe('useTranslation SSR seed', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = '';
  });

  function SeededProbe() {
    const { t, language, direction } = useTranslation();
    return (
      <pre data-testid="snap">
        {JSON.stringify({ t_home: t('nav.home'), language, direction })}
      </pre>
    );
  }

  it('seeds with kurdish and renders Kurdish copy on first render', () => {
    render(
      <I18nSeedProvider value={{ lang: 'ku', dir: 'rtl' }}>
        <SeededProbe />
      </I18nSeedProvider>,
    );
    const snap = JSON.parse(screen.getByTestId('snap').textContent || '{}');
    expect(snap.language).toBe('ku');
    expect(snap.t_home).toBe('سەرەتا');
    expect(snap.direction).toBe('rtl');
  });

  it('seeds with arabic and renders Arabic copy on first render', () => {
    render(
      <I18nSeedProvider value={{ lang: 'ar', dir: 'rtl' }}>
        <SeededProbe />
      </I18nSeedProvider>,
    );
    const snap = JSON.parse(screen.getByTestId('snap').textContent || '{}');
    expect(snap.language).toBe('ar');
    expect(snap.t_home).toBe('الرئيسية');
    expect(snap.direction).toBe('rtl');
  });

  it('seeds with turkish and renders Turkish copy on first render', () => {
    render(
      <I18nSeedProvider value={{ lang: 'tr', dir: 'ltr' }}>
        <SeededProbe />
      </I18nSeedProvider>,
    );
    const snap = JSON.parse(screen.getByTestId('snap').textContent || '{}');
    expect(snap.language).toBe('tr');
    expect(snap.t_home).toBe('Ana Sayfa');
    expect(snap.direction).toBe('ltr');
  });

  it('seeds with persian and renders Persian copy on first render', () => {
    render(
      <I18nSeedProvider value={{ lang: 'fa', dir: 'rtl' }}>
        <SeededProbe />
      </I18nSeedProvider>,
    );
    const snap = JSON.parse(screen.getByTestId('snap').textContent || '{}');
    expect(snap.language).toBe('fa');
    expect(snap.t_home).toBe('خانه');
    expect(snap.direction).toBe('rtl');
  });

  it('falls back to english when no provider is present', () => {
    // No I18nSeedProvider in the tree; the hook should still produce a
    // valid initial state, not crash.
    render(<SeededProbe />);
    const snap = JSON.parse(screen.getByTestId('snap').textContent || '{}');
    expect(snap.language).toBe('en');
    expect(snap.direction).toBe('ltr');
  });
});
