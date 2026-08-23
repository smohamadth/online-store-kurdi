/**
 * LanguageSwitcher.
 *
 * - Renders the current language's flag and code.
 * - Toggles the dropdown open/closed.
 * - Lists all four languages.
 * - Highlights the active language with a checkmark.
 * - Clicking a language calls changeLanguage and closes the dropdown.
 * - Clicking the scrim closes the dropdown without changing language.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import LanguageSwitcher from '@/components/LanguageSwitcher';

vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual<any>('@/lib/i18n');
  return {
    ...actual,
    useTranslation: () => {
      const state = (globalThis as any).__i18nState || { language: 'en' };
      return {
        t: (k: string, fb?: string) => fb || k,
        language: state.language,
        direction: state.language === 'ar' || state.language === 'ku' ? 'rtl' : 'ltr',
        changeLanguage: (code: string) => {
          if ((globalThis as any).__i18nState) {
            (globalThis as any).__i18nState.language = code;
          }
        },
        languages: actual.languages,
      };
    },
  };
});

beforeEach(() => {
  delete (globalThis as any).__i18nState;
});

describe('LanguageSwitcher', () => {
  it('shows the current language code and flag in the trigger', () => {
    (globalThis as any).__i18nState = { language: 'en' };
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole('button', { name: /🇬🇧 EN/ });
    expect(trigger).toBeInTheDocument();
  });

  it('does not show the dropdown initially', () => {
    render(<LanguageSwitcher />);
    // The four language names (English, Kurdish, Arabic, Turkish) are only
    // visible when the dropdown is open.
    expect(screen.queryByText('English')).not.toBeInTheDocument();
    expect(screen.queryByText('العربية')).not.toBeInTheDocument();
  });

  it('opens the dropdown listing all four languages', () => {
    render(<LanguageSwitcher />);
    act(() => screen.getByRole('button', { name: /🇬🇧 EN/ }).click());
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('کوردی')).toBeInTheDocument();
    expect(screen.getByText('العربية')).toBeInTheDocument();
    expect(screen.getByText('Türkçe')).toBeInTheDocument();
  });

  it('marks the active language with a checkmark', () => {
    (globalThis as any).__i18nState = { language: 'ar' };
    render(<LanguageSwitcher />);
    act(() => screen.getByRole('button').click());

    // The Arabic row contains the checkmark span. Locate by row text.
    const arRow = screen.getByText('العربية').closest('button')!;
    expect(arRow.textContent).toContain('✓');

    // English row is NOT the active one.
    const enRow = screen.getByText('English').closest('button')!;
    expect(enRow.textContent).not.toContain('✓');
  });

  it('clicking a language invokes changeLanguage and closes the dropdown', () => {
    (globalThis as any).__i18nState = { language: 'en' };
    render(<LanguageSwitcher />);
    act(() => screen.getByRole('button', { name: /🇬🇧 EN/ }).click());
    expect(screen.getByText('العربية')).toBeInTheDocument();

    act(() => screen.getByText('العربية').click());
    expect((globalThis as any).__i18nState.language).toBe('ar');
    // Dropdown closed.
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });

  it('clicking the scrim closes the dropdown without changing language', () => {
    (globalThis as any).__i18nState = { language: 'en' };
    const { container } = render(<LanguageSwitcher />);
    act(() => screen.getByRole('button', { name: /🇬🇧 EN/ }).click());
    expect(screen.getByText('العربية')).toBeInTheDocument();

    // The scrim is a fixed-position div with inline z-index 99. Find it
    // by its inline style rather than a role because it has none.
    const scrim = container.querySelector('div[style*="z-index: 99"]') as HTMLElement;
    expect(scrim).toBeInTheDocument();
    act(() => scrim.click());

    expect((globalThis as any).__i18nState.language).toBe('en');
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });
});
