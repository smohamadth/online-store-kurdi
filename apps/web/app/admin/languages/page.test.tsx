import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminLanguagesPage from './page';

const catalog = {
  languages: [
    { code: 'en', name: 'English', dir: 'ltr', flag: '🇬🇧', enabled: true },
    { code: 'ku', name: 'کوردی', dir: 'rtl', flag: '🏴', enabled: true },
  ],
  strings: { en: { 'nav.home': 'Home' } },
};

beforeEach(() => {
  localStorage.setItem('token', 't');
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/i18n/storefront') && (!init || init.method === 'GET' || !init.method)) {
      return { ok: true, json: async () => ({ status: 'success', data: catalog }) } as any;
    }
    return {
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          languages: [
            ...catalog.languages,
            { code: 'de', name: 'Deutsch', dir: 'ltr', flag: '🏳️', enabled: true },
          ],
          strings: catalog.strings,
        },
      }),
    } as any;
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AdminLanguagesPage', () => {
  it('lists storefront languages and UI keys', async () => {
    render(<AdminLanguagesPage />);
    expect(await screen.findByText(/Storefront languages/)).toBeTruthy();
    expect(screen.getByText(/English/)).toBeTruthy();
    expect(screen.getByLabelText('nav.home')).toBeTruthy();
  });

  it('can add a language', async () => {
    render(<AdminLanguagesPage />);
    await screen.findByText(/Storefront languages/);
    fireEvent.change(screen.getByLabelText('New language code'), { target: { value: 'de' } });
    fireEvent.change(screen.getByLabelText('New language name'), { target: { value: 'Deutsch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add language' }));
    await waitFor(() => expect(screen.getByText(/Saved/)).toBeTruthy());
  });
});
