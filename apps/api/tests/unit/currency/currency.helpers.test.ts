/**
 * Unit tests for the currency helpers.
 *
 * Three concerns under test:
 *   1. `convert` — the same formula the server uses must
 *      match the client's formula, otherwise the storefront
 *      and the admin's reports disagree on prices.
 *   2. `formatMoney` — Intl.NumberFormat output for known
 *      inputs in a few locales. This is mostly a smoke test;
 *      the real coverage is "does the runtime ship full ICU",
 *      which the browser guarantees but happy-dom doesn't.
 *   3. `parseOpenErApiResponse` — the parser must accept the
 *      actual shape the API returns, not a simplified stub.
 *      A previous draft of this file got the semantics
 *      wrong; the unit test pins the right behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  convert,
  formatMoney,
  parseOpenErApiResponse,
  roundForCurrency,
} from '../../../src/modules/currency/currency.helpers';

describe('convert', () => {
  // Semantics: `convert(amount, from, to, rates)` takes an
  // amount denominated in `from` and returns the same value
  // denominated in `to`. The rate map is `rateFromBase(code)`:
  // the number of `code` units one base unit buys. So with
  // base=USD, `rates.EUR = 0.919` means "1 USD = 0.919 EUR".
  //
  // Formula: amount * rateFromBase(to) / rateFromBase(from).
  // Worked example with EUR=0.919:
  //   convert(100, 'USD', 'EUR') = 100 * 0.919 / 1 = 91.9 EUR
  //   convert(100, 'EUR', 'USD') = 100 * 1 / 0.919 ≈ 108.8 USD
  // Both correct: 100 USD ≈ 91.9 EUR, 100 EUR ≈ 108.8 USD.

  it('returns the same amount when from === to', () => {
    expect(convert(100, 'USD', 'USD', { USD: 1, EUR: 0.92 })).toBe(100);
  });

  it('converts USD to EUR', () => {
    // 100 USD. amount * 0.92 (EUR rate) / 1 (USD rate) = 92 EUR.
    expect(convert(100, 'USD', 'EUR', { USD: 1, EUR: 0.92 })).toBeCloseTo(92, 6);
  });

  it('converts EUR to USD', () => {
    // 100 EUR. amount * 1 (USD rate) / 0.92 (EUR rate) ≈ 108.7 USD.
    expect(convert(100, 'EUR', 'USD', { USD: 1, EUR: 0.92 })).toBeCloseTo(108.6956, 3);
  });

  it('handles a third-currency chain (JPY -> USD -> EUR)', () => {
    // With base=USD and rates from the API:
    //   JPY: 152.34 means 1 USD = 152.34 JPY
    //   EUR: 0.92 means 1 USD = 0.92 EUR
    //
    // 10000 JPY -> EUR: 10000 * 0.92 (EUR rate) / 152.34 (JPY rate)
    //                ≈ 60.39 EUR
    //
    // (The previous draft of this test computed the wrong
    // expected value because the formula had `fromRate` and
    // `toRate` swapped. Pin the correct value here.)
    const rates = { USD: 1, EUR: 0.92, JPY: 152.34 };
    expect(convert(10000, 'JPY', 'EUR', rates)).toBeCloseTo(60.39, 1);
  });

  it('returns the input untouched when a rate is missing', () => {
    // Defensive: a misconfigured storefront (a rate was
    // missing) must not return NaN. The original amount
    // surfaces, the UI layer can warn the admin.
    expect(convert(100, 'XYZ', 'EUR', { USD: 1, EUR: 0.92 })).toBe(100);
  });
});

describe('roundForCurrency', () => {
  it('rounds to 2dp by default', () => {
    expect(roundForCurrency(1.234, 'USD')).toBe(1.23);
    expect(roundForCurrency(1.236, 'USD')).toBe(1.24);
  });

  it('rounds to 0dp for JPY / KRW / VND etc', () => {
    expect(roundForCurrency(1234.567, 'JPY')).toBe(1235);
    expect(roundForCurrency(1234.567, 'KRW')).toBe(1235);
  });

  it('rounds at the correct precision even with long decimals', () => {
    // (0.123456).toFixed(2) === '0.12' (already 2dp in
    // representation; the function should match).
    expect(roundForCurrency(0.123456, 'USD')).toBe(0.12);
    // A value that lands exactly on a 2dp boundary.
    expect(roundForCurrency(1.235, 'USD')).toBe(1.24);
  });
});

describe('formatMoney', () => {
  it('formats USD in en-US with the locale default', () => {
    // en-US uses $X,XXX.XX with the symbol before the number.
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
  });

  it('formats USD in de-DE with the German convention', () => {
    // de-DE uses 1.234,50 $ with the symbol after, and
    // a . as the thousands separator.
    const out = formatMoney(1234.5, 'USD', 'de-DE');
    expect(out).toContain('1.234');
    expect(out).toContain('50');
    expect(out).toMatch(/\$/);
  });

  it('formats JPY in ja-JP without decimals (locale default)', () => {
    // JPY's Intl default is 0 fraction digits.
    const out = formatMoney(1234, 'JPY', 'ja-JP');
    expect(out).toContain('1,234');
    expect(out).not.toMatch(/1234\.\d/);
  });

  it('formats Arabic-Indic digits in ar-IQ when the locale asks for it', () => {
    // ar-IQ is an RTL locale. The exact digit shape depends
    // on the runtime; we just assert the formatter
    // accepts the locale without throwing and returns a
    // non-empty string.
    const out = formatMoney(1234.5, 'IQD', 'ar-IQ');
    expect(out.length).toBeGreaterThan(0);
  });

  it('honours an explicit decimalPlaces override for 3-dp currencies', () => {
    // KWD is 3dp; pass an override and verify it sticks.
    const out = formatMoney(1.23456, 'KWD', 'en-US', { decimalPlaces: 3 });
    expect(out).toContain('1.235');
  });
});

describe('parseOpenErApiResponse', () => {
  it('parses the documented success response', () => {
    const body = {
      result: 'success',
      provider: 'https://www.exchangerate-api.com',
      documentation: 'https://www.exchangerate-api.com/docs/free',
      terms_of_use: 'https://www.exchangerate-api.com/terms',
      time_last_update_unix: 0,
      time_last_update_utc: '',
      time_next_update_unix: 0,
      time_next_update_utc: '',
      time_eol_unix: 0,
      base_code: 'USD',
      rates: {
        USD: 1,
        AED: 3.67,
        AFN: 67.5,
        EUR: 0.92,
        GBP: 0.79,
        JPY: 152.34,
      },
    };
    const { base, rates } = parseOpenErApiResponse(body, 'USD');
    expect(base).toBe('USD');
    expect(rates.USD).toBe(1);
    expect(rates.EUR).toBe(0.92);
    expect(rates.GBP).toBe(0.79);
    expect(rates.JPY).toBe(152.34);
  });

  it('skips non-finite and non-positive entries', () => {
    // The API occasionally returns "N/A" or 0 for a few
    // currencies. A clean parse must not let those poison
    // the map.
    const body = {
      result: 'success',
      base_code: 'USD',
      rates: {
        USD: 1,
        EUR: 0.92,
        // These are noise the parser must filter.
        BAD1: 'N/A',
        BAD2: 0,
        BAD3: -1,
        BAD4: null,
        OK: 1.5,
      },
    };
    const { rates } = parseOpenErApiResponse(body, 'USD');
    expect(rates.EUR).toBe(0.92);
    expect(rates.OK).toBe(1.5);
    expect(rates.BAD1).toBeUndefined();
    expect(rates.BAD2).toBeUndefined();
    expect(rates.BAD3).toBeUndefined();
    expect(rates.BAD4).toBeUndefined();
  });

  it('throws when the API returns an error body', () => {
    expect(() =>
      parseOpenErApiResponse(
        { result: 'error', 'error-type': 'unsupported-code' },
        'XYZ',
      ),
    ).toThrow(/unsupported-code/);
  });

  it('throws when the body is not an object', () => {
    expect(() => parseOpenErApiResponse('not json', 'USD')).toThrow(/not an object/);
  });
});
