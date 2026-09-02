/**
 * CurrencyPicker component test.
 *
 * Picker renders nothing when there's only one currency
 * (no point showing a one-option dropdown). It renders the
 * full list otherwise and forwards the visitor's pick to
 * the useCurrency hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  setDisplayCode: vi.fn(),
  currentCurrencies: [] as any[],
  currentDisplayCode: 'USD',
}));

vi.mock('@/lib/currency', () => ({
  useCurrency: () => ({
    displayCode: hoisted.currentDisplayCode,
    currencies: hoisted.currentCurrencies,
    baseCode: 'USD',
    locale: 'en-US',
    formatMoney: (n: number) => `$${n.toFixed(2)}`,
    setDisplayCode: hoisted.setDisplayCode,
  }),
}));

vi.mock('@/lib/i18n', () => ({
  // The real hook returns an object, not an array; this mock mirrors
  // the actual shape so the test would catch a hook-signature regression
  // that previously slipped through (`['en', () => {}]` would still
  // satisfy a consumer that destructures as `[lang, setLang]` but
  // crashes on `{ language, changeLanguage }`).
  useTranslation: () => ({
    t: (k: string, fb?: string) => fb || k,
    language: 'en',
    direction: 'ltr',
    changeLanguage: () => {},
    languages: [],
  }),
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD' }, loading: false }),
}));

import CurrencyPicker from './CurrencyPicker';

beforeEach(() => {
  hoisted.setDisplayCode.mockReset();
  hoisted.currentCurrencies = [];
  hoisted.currentDisplayCode = 'USD';
});

describe('CurrencyPicker', () => {
  it('renders nothing when there is only one currency', () => {
    hoisted.currentCurrencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: null, rateToBase: 1, isBase: true },
    ];
    const { container } = render(<CurrencyPicker />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a <select> with one option per enabled currency', async () => {
    hoisted.currentCurrencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: null, rateToBase: 1, isBase: true },
      { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: null, rateToBase: 0.92, isBase: false },
      { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: null, rateToBase: 0.79, isBase: false },
    ];
    render(<CurrencyPicker />);
    const select = await screen.findByTestId('currency-picker');
    expect(select).toBeInTheDocument();
    // Three options, one per currency.
    expect(select.querySelectorAll('option')).toHaveLength(3);
  });

  it('forwards the change to setDisplayCode', async () => {
    hoisted.currentCurrencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: null, rateToBase: 1, isBase: true },
      { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: null, rateToBase: 0.92, isBase: false },
    ];
    render(<CurrencyPicker />);
    const select = await screen.findByTestId('currency-picker');
    fireEvent.change(select, { target: { value: 'EUR' } });
    await waitFor(() => expect(hoisted.setDisplayCode).toHaveBeenCalledWith('EUR'));
  });
});
