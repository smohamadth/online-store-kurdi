'use client';

/**
 * Currency display layer.
 *
 * `useCurrency()` is the storefront's hook for everything price-
 * related. It:
 *
 *   1. Loads the enabled currencies from /api/currencies on
 *      mount. The list includes the base currency (always
 *      available) plus anything the admin enabled.
 *   2. Picks a display currency for the visitor. Order:
 *      a) cookie/localStorage override (set by the picker)
 *      b) i18n language (if the merchant enabled that code)
 *      c) base currency (always available)
 *   3. Exposes a `formatMoney(amountInBaseCurrency)` that
 *      converts the amount to the chosen display currency
 *      using the rates from the API, then runs it through
 *      Intl.NumberFormat for locale-correct symbol position,
 *      decimal separator, and thousands grouping.
 *
 * The conversion math is the same as the server's, so the
 * display and the admin's reports agree to the cent.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStoreSettings } from './settings';
import { useTranslation } from './i18n';

export interface DisplayCurrency {
  code: string;
  name: string;
  symbol: string;
  /** Override the locale-derived fraction digits. Null =
   *  use the runtime default. */
  decimalPlaces: number | null;
  /** 1 unit of base currency = N units of this currency. */
  rateToBase: number;
  isBase: boolean;
}

const STORAGE_KEY = 'cms.displayCurrency';
const API_BASE = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:3001/api';

/**
 * Same conversion formula as the server. The rate map is
 * `rateFromBase(code)` (see currency.helpers.ts for the
 * naming tradeoff): the number of `code` units one base
 * unit buys. The formula is `amount * toRate / fromRate`.
 */
export function convert(
  amountInBase: number,
  fromCode: string,
  toCode: string,
  rates: Record<string, number>,
): number {
  if (fromCode === toCode) return amountInBase;
  const fromRate = rates[fromCode];
  const toRate = rates[toCode];
  if (!fromRate || !toRate) return amountInBase;
  return (amountInBase * toRate) / fromRate;
}

export interface UseCurrencyResult {
  /** The code the visitor is currently viewing in. */
  displayCode: string;
  /** The full list of enabled currencies, with the base first. */
  currencies: DisplayCurrency[];
  /** The base currency code (the one prices are stored in). */
  baseCode: string;
  /** The current visitor's locale (ku / ar / en / tr). */
  locale: string;
  /** Format an amount denominated in the base currency. */
  formatMoney: (amount: number) => string;
  /** Switch the visitor's display currency. Persists in localStorage. */
  setDisplayCode: (code: string) => void;
}

const LOCALE_FOR_LANG: Record<string, string> = {
  // Map the i18n language code to a BCP 47 locale. The locale
  // drives Intl.NumberFormat's number formatting and the
  // thousands separator. RTL languages get their native locale
  // so the formatter uses the right direction.
  en: 'en-US',
  ku: 'ckb-IQ', // Central Kurdish (Iraq); uses Arabic-Indic digits in ar-IQ.
  ar: 'ar-IQ',
  tr: 'tr-TR',
};

export function useCurrency(): UseCurrencyResult {
  const { settings, loading: settingsLoading } = useStoreSettings();
  const { language: lang } = useTranslation();
  const [currencies, setCurrencies] = useState<DisplayCurrency[]>([]);
  const [displayCode, setDisplayCodeState] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Load the enabled-currency list once. We don't refetch on
  // every render: the list is small and changes only when the
  // admin runs a manual refresh (which is itself a no-op for
  // the rate, not the code list). Re-fetching on focus would
  // mean the picker flashes when the admin tab is open in
  // the background.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/currencies`);
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setCurrencies(data.data || []);
      } catch {
        // The store is offline (dev mode, etc.). Fall through
        // to the base currency.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Once the settings are loaded, pick a default display
  // currency. The chosen order: cookie override > i18n lang
  // (if the merchant enabled that code) > base.
  useEffect(() => {
    if (loading || settingsLoading) return;
    if (displayCode) return; // visitor already picked one
    const baseCode = settings.currency || 'USD';
    const codes = new Set(currencies.map((c) => c.code));
    const override = (() => {
      if (typeof window === 'undefined') return null;
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (override && codes.has(override)) {
      setDisplayCodeState(override);
      return;
    }
    if (codes.has(lang)) {
      setDisplayCodeState(lang);
      return;
    }
    setDisplayCodeState(baseCode);
  }, [currencies, displayCode, lang, loading, settings.currency, settingsLoading]);

  const setDisplayCode = useCallback((code: string) => {
    setDisplayCodeState(code);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch {
        /* noop */
      }
    }
  }, []);

  const baseCode = settings.currency || 'USD';

  // Pre-compute the rate map. Currencies arrive with a
  // rateToBase, so a row lookup is O(1).
  const rateMap = useMemo(() => {
    const m: Record<string, number> = { [baseCode]: 1.0 };
    for (const c of currencies) m[c.code] = c.rateToBase;
    return m;
  }, [baseCode, currencies]);

  const formatMoney = useCallback(
    (amount: number): string => {
      const code = displayCode || baseCode;
      const rate = rateMap[code] ?? 1;
      const converted = convert(amount, baseCode, code, rateMap);
      const override = currencies.find((c) => c.code === code)?.decimalPlaces ?? null;
      const locale = LOCALE_FOR_LANG[lang] || 'en-US';
      // If the requested code isn't in our enabled list (e.g.
      // the admin removed it after the visitor picked it), fall
      // back to the base. The rateMap returns 1 for the base
      // so convert() is a no-op.
      try {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: code,
          ...(override != null
            ? { minimumFractionDigits: override, maximumFractionDigits: override }
            : {}),
        }).format(converted);
      } catch {
        // Some test environments don't ship full ICU data;
        // fall back to a manual format.
        const symbol = currencies.find((c) => c.code === code)?.symbol || code;
        return `${symbol}${converted.toFixed(2)}`;
      }
    },
    [baseCode, currencies, displayCode, lang, rateMap],
  );

  return {
    displayCode: displayCode || baseCode,
    currencies,
    baseCode,
    locale: LOCALE_FOR_LANG[lang] || 'en-US',
    formatMoney,
    setDisplayCode,
  };
}
