/**
 * LanguageSwitcher.
 *
 * - Renders the current language's flag and code.
 * - Toggles the dropdown open/closed.
 * - Lists all five languages.
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
        direction: state.language === 'ar' || state.language === 'ku' || state.language === 'fa' ? 'rtl' : 'ltr',
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
    // The five language names (English, Kurdish, Arabic, Persian, Turkish)
    // are only visible when the dropdown is open.
    expect(screen.queryByText('English')).not.toBeInTheDocument();
    expect(screen.queryByText('العربية')).not.toBeInTheDocument();
  });

  it('opens the dropdown listing all five languages', () => {
    render(<LanguageSwitcher />);
    act(() => screen.getByRole('button', { name: /🇬🇧 EN/ }).click());
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('کوردی')).toBeInTheDocument();
    expect(screen.getByText('العربية')).toBeInTheDocument();
    expect(screen.getByText('فارسی')).toBeInTheDocument();
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

  /**
   * RTL: when the document direction is rtl the dropdown anchor, the row
   * text alignment, and the caret must all mirror. The previous version
   * hard-coded `right: 0` on the dropdown (so it stuck off the right edge
   * when the trigger was on the right of a header) and `textAlign: 'left'`
   * on the rows (so Arabic / Kurdish names were left-aligned inside a
   * right-aligned page). The fix is logical CSS (insetInlineEnd /
   * text-align: start), which mirrors with the document direction.
   */
  it('anchors the dropdown to the inline-end of the trigger in RTL', () => {
    (globalThis as any).__i18nState = { language: 'ar' };
    const { container } = render(<LanguageSwitcher />);
    act(() => screen.getByRole('button').click());

    // The dropdown is the only absolute-positioned div inside the
    // switcher's root besides the scrim. It is also identifiable by
    // its min-width: 150px inline style.
    const dropdown = container.querySelector('div[style*="min-width: 150px"]') as HTMLElement;
    expect(dropdown).toBeTruthy();
    // Inline-end is the LEFT edge of the trigger in RTL and the RIGHT
    // edge in LTR - the logical anchor must be set, and no physical
    // left/right may pin it (a physical pin is the original bug).
    // 0 is unitless (valid CSS for inset), so the serialisation is '0'.
    expect(dropdown.style.insetInlineEnd).toBe('0');
    expect(dropdown.style.left).toBe('');
    expect(dropdown.style.right).toBe('');
  });

  it('aligns row text to the inline-start edge in RTL so the script reads naturally', () => {
    (globalThis as any).__i18nState = { language: 'ku' };
    render(<LanguageSwitcher />);
    act(() => screen.getByRole('button').click());
    // Every row in the dropdown.
    const arRow = screen.getByText('العربية').closest('button') as HTMLButtonElement;
    const enRow = screen.getByText('English').closest('button') as HTMLButtonElement;
    expect(arRow.style.textAlign).toBe('start');
    expect(enRow.style.textAlign).toBe('start');
  });

  it('aligns row text to the inline-start edge in LTR (regression guard)', () => {
    render(<LanguageSwitcher />);
    act(() => screen.getByRole('button', { name: /🇬🇧 EN/ }).click());
    const enRow = screen.getByText('English').closest('button') as HTMLButtonElement;
    expect(enRow.style.textAlign).toBe('start');
  });
});
