/**
 * Client-side currency conversion tests.
 *
 * The same `convert` formula must match the server's
 * `currency.helpers.convert` exactly — otherwise the
 * storefront's display price disagrees with the
 * admin-facing reports and the order total the API computed
 * for checkout. The function is duplicated rather than
 * imported so the client never has to round-trip a price to
 * /api for conversion. The duplication is intentional; the
 * tests pin both sides against the same expected values.
 */
import { describe, it, expect } from 'vitest';
import { convert } from './currency';

describe('convert (client)', () => {
  it('matches the server formula for the worked example', () => {
    // With base=USD and rates {USD:1, EUR:0.919}: 100 EUR
    // should become 100 * 1 / 0.919 = 108.81 USD.
    expect(convert(100, 'EUR', 'USD', { USD: 1, EUR: 0.919 })).toBeCloseTo(108.81, 1);
  });

  it('is a no-op when from === to', () => {
    expect(convert(100, 'USD', 'USD', { USD: 1, EUR: 0.919 })).toBe(100);
  });

  it('returns the input untouched when a rate is missing', () => {
    // A misconfigured storefront (a rate the admin forgot to
    // enable) must not return NaN. The UI can warn the admin.
    expect(convert(100, 'XYZ', 'EUR', { USD: 1, EUR: 0.919 })).toBe(100);
  });
});
