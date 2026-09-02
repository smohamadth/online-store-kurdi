/**
 * Currency helpers — pure functions for the multi-currency system.
 *
 * Kept separate from the route so the conversion math, the
 * formatting logic, and the rate-fetching parser are all
 * unit-testable without spinning up Express.
 *
 * Three concerns, three exports:
 *   1. `convert(price, from, to, rates)` — convert a price from
 *      one currency to another using a rates map.
 *   2. `formatMoney(amount, currency, locale)` — produce the
 *      human-readable string the storefront renders. Uses
 *      Intl.NumberFormat so the symbol position, decimal
 *      separator, and thousands grouping follow the locale.
 *   3. `parseOpenErApiResponse(body, base)` — turn the open
 *      exchange-rates API's JSON shape into the rate map the
 *      job writes to the Currency table.
 */

/**
 * Map of ISO 4217 code -> rate to multiply BY. The semantics
 * follow the `Currency.rateToBase` column: rateToBase for
 * USD is 1.0, for EUR with USD as base is 0.92 (one USD
 * buys 0.92 EUR), etc. The conversion formula in
 * `convert` is: amountInBase = amount * rateFromBase(from);
 * amountInTo = amountInBase / rateFromBase(to).
 */
export type RateMap = Record<string, number>;

/**
 * Convert `amount` from `from` to `to` using the given rates.
 *
 * The `rates` map is `rateFromBase(code)`: the number of `code`
 * units one base unit buys. So with base=USD,
 *   { USD: 1, EUR: 0.919, JPY: 152.34 }
 * means "1 USD buys 1 USD / 0.919 EUR / 152.34 JPY". This is
 * the exact shape the open-ER-API returns, so the parser
 * (parseOpenErApiResponse) passes the values through unchanged.
 *
 * Formula: `amount * rateFromBase(to) / rateFromBase(from)`.
 *
 * Worked example with base=USD, rateFromBase EUR=0.919:
 *   convert(100, 'USD', 'EUR') = 100 * 0.919 / 1 = 91.9
 *   convert(100, 'EUR', 'USD') = 100 * 1 / 0.919 ≈ 108.8
 * Both correct: 100 USD ≈ 91.9 EUR, 100 EUR ≈ 108.8 USD.
 *
 * Defensive: returns the original amount untouched if either
 * rate is missing. A misconfigured storefront should never
 * render NaN.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: RateMap,
): number {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return amount;
  return (amount * toRate) / fromRate;
}

/**
 * Format a money amount in a given currency, using a locale.
 *
 * Uses Intl.NumberFormat so the symbol position, decimal
 * separator, and grouping all follow the locale. e.g. format
 * (1234.5, 'USD', 'en-US') -> "$1,234.50"; the same value in
 * 'de-DE' is "1.234,50 $". For RTL languages (ar, ku, fa, he)
 * the formatter uses the locale's native numerals and
 * separators, which is what the i18n dictionary's
 * `dir: 'rtl'` already opts the storefront into.
 *
 * Currencies with a non-standard number of decimal places
 * (JOD=3, BHD=3, KWD=3, IQD=3, TND=3, LYD=3) override the
 * Intl default when `decimalPlaces` is provided.
 */
export function formatMoney(
  amount: number,
  currency: string,
  locale: string,
  options: { decimalPlaces?: number | null } = {},
): string {
  // `style: 'currency'` makes Intl use the canonical symbol
  // for the currency + locale pair. For most cases that's
  // what the merchant wants.
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // minimumFractionDigits defaults to 2 for currency style
    // (and to the currency's standard fraction digits when
    // the override is null). max defaults to the standard
    // fraction digits. We honour a manual override when given.
    ...(options.decimalPlaces != null
      ? {
          minimumFractionDigits: options.decimalPlaces,
          maximumFractionDigits: options.decimalPlaces,
        }
      : {}),
  });
  return fmt.format(amount);
}

/**
 * Round a converted amount to the currency's natural precision.
 * Intl.NumberFormat already rounds at format time, but the
 * server-side conversion can return a long float that the
 * client prefers to see pre-rounded (e.g. in JSON, where
 * `0.30000000000000004` is noisy). 2dp is the right default
 * for almost every currency; 0 for JPY, KRW, etc.
 */
export function roundForCurrency(amount: number, currency: string): number {
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
  // toFixed + Number is safer than `Math.round(x * 100) / 100`
  // because it avoids floating-point drift on edge cases
  // (e.g. 1.005 -> 1.00 with the naive approach).
  return Number(amount.toFixed(fractionDigits));
}

/** ISO 4217 codes that conventionally take 0 decimal places. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW',
  'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF',
  'XPF',
]);

/**
 * Codes with 3 decimal places that Intl knows about.
 * Listed here so the admin form can offer a sensible default
 * and a tested override.
 */
export const THREE_DECIMAL_CURRENCIES = new Set([
  'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND',
]);

/**
 * Parse the JSON body returned by open.er-api.com
 * (https://open.er-api.com/v6/latest/<BASE>). The shape is:
 *
 *   { result: 'success', base_code: 'USD',
 *     rates: { EUR: 0.92, GBP: 0.79, JPY: 152.34, ... } }
 *
 * The key thing to know: `rates[code]` is "how many `<code>`
 * does one `<base>` buy?" — same semantics as our
 * `Currency.rateToBase` column. So no inversion is needed;
 * we copy the values straight through (skipping non-finite
 * or non-positive entries). The base itself is implicit and
 * gets 1.0.
 */
export function parseOpenErApiResponse(
  body: any,
  base: string,
): { base: string; rates: RateMap; fetchedAt: Date } {
  if (!body || typeof body !== 'object') {
    throw new Error('Open-ER response was not an object');
  }
  if (body.result !== 'success') {
    // The API returns { result: 'error', 'error-type': '...' } for
    // an unsupported base. Surface that as a typed error.
    throw new Error(
      `Open-ER returned an error: ${body['error-type'] ?? 'unknown'}`,
    );
  }
  if (typeof body.rates !== 'object' || body.rates === null) {
    throw new Error('Open-ER response had no `rates` object');
  }
  const out: RateMap = {};
  out[base] = 1.0;
  for (const [code, rawRate] of Object.entries(body.rates as Record<string, unknown>)) {
    const apiRate = Number(rawRate);
    if (!Number.isFinite(apiRate) || apiRate <= 0) continue;
    out[code] = apiRate;
  }
  return { base, rates: out, fetchedAt: new Date() };
}
