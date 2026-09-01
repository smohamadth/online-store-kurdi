/**
 * coupons.ts — the storefront coupon API.
 *
 * Notable paths:
 *   - validateCoupon swallows the rejection and returns a normal error
 *     shape (so the UI can show why without a try/catch)
 *   - formatDiscount renders each type correctly
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatDiscount, validateCoupon } from './coupons';


type FetchMockInit = {
  headers: Record<string, string>;
  body: string;
  method?: string;
};

describe('formatDiscount', () => {
  it('renders percentage coupons', () => {
    expect(formatDiscount({ type: 'percentage', value: 10 } as any)).toBe('10% off');
  });

  it('renders fixed-amount coupons', () => {
    expect(formatDiscount({ type: 'fixed', value: 20 } as any)).toBe('20 off');
  });

  it('renders free-shipping coupons', () => {
    expect(formatDiscount({ type: 'free_shipping' } as any)).toBe('Free shipping');
  });

  it('returns empty string for an unknown type', () => {
    expect(formatDiscount({ type: 'weird' } as any)).toBe('');
  });
});

describe('validateCoupon', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the validation result on a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { valid: true, discount: 5 } }),
    })) as any);
    const r = await validateCoupon('WELCOME', 100);
    expect(r.valid).toBe(true);
    expect(r.discount).toBe(5);
  });

  it('returns the server error message when the coupon is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { valid: false, error: 'expired' } }),
    })) as any);
    const r = await validateCoupon('OLD', 100);
    expect(r.valid).toBe(false);
    expect(r.error).toBe('expired');
  });

  it('swallows a network failure and returns a generic error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Net'); }) as any);
    const r = await validateCoupon('ANY', 100);
    expect(r.valid).toBe(false);
    // The shared http client throws an ApiError with a friendly message;
    // coupons.ts surfaces that message to the caller.
    expect(r.error).toMatch(/reach the server/i);
  });

  it('POSTs the code and subtotal to /coupons/validate', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { valid: false } }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    await validateCoupon('CODE', 250);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, FetchMockInit];
    expect(url).toMatch(/\/coupons\/validate$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ code: 'CODE', subtotal: 250 });
  });
});
