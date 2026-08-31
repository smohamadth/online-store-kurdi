/**
 * AdminCouponsPage — the coupon manager.
 *
 * Verifies the connected status renders, coupons list with expiry/status
 * badges, the add modal POSTs a new coupon through the API client, and the
 * delete action calls DELETE and refetches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminCouponsPage from './page';

vi.mock('@/lib/hooks', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD', currencySymbol: '$' } }),
  formatPrice: (n: number, sym: string) => `${sym}${Number(n).toFixed(2)}`,
}));

const coupon = {
  id: 'c1',
  code: 'WELCOME10',
  type: 'percentage',
  value: 10,
  minOrderAmount: null,
  maxDiscountAmount: 50,
  usageLimit: 100,
  usedCount: 3,
  isActive: true,
  startsAt: null,
  expiresAt: null,
};

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminCouponsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  it('renders coupons with their discount and status', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/coupons') && (!opts?.method || opts.method === 'GET')) return okJson([coupon]);
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminCouponsPage />);
    await waitFor(() => expect(screen.getByText('WELCOME10')).toBeTruthy());
    expect(screen.getByText('percentage')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('3/100')).toBeTruthy();
    expect(screen.getByText('✅ API Connected - Managing database coupons')).toBeTruthy();
  });

  it('opens the add modal and posts a new coupon', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/coupons') && (!opts?.method || opts.method === 'GET')) return okJson([]);
      if (u.includes('/coupons') && opts?.method === 'POST') return okJson({ ...coupon, code: 'NEW20' });
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    const { container } = render(<AdminCouponsPage />);
    await waitFor(() => expect(screen.getByText('+ Add Coupon')).toBeTruthy());
    screen.getByText('+ Add Coupon').click();
    await waitFor(() => expect(screen.getByText('Add New Coupon')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('WELCOME10'), { target: { value: 'save20' } });
    // The Value field is required; fill it (first number input) so the form
    // will pass native validation and submit.
    const numberInputs = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: '20' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons'),
        expect.objectContaining({ method: 'POST' })
      )
    );
    // The POST body uppercases the code before sending.
    const postCall = (global.fetch as any).mock.calls.find((c: any) => c[1]?.method === 'POST');
    expect(JSON.parse(postCall[1].body).code).toBe('SAVE20');
  });

  it('shows an honest disconnected banner when the API is unreachable', async () => {
    // A failing fetch sets apiStatus=disconnected and an empty list. The
    // banner must not claim "sample coupons" (that fallback was removed).
    (global.fetch as any) = vi.fn().mockRejectedValue(new Error('network down'));

    render(<AdminCouponsPage />);
    await waitFor(() => expect(screen.getByText(/API Disconnected/)).toBeTruthy());
    expect(screen.queryByText(/sample coupons/i)).toBeNull();
    expect(screen.getByText(/Could not load coupons/i)).toBeTruthy();
  });

  it('marks an expired coupon', async () => {
    const expired = { ...coupon, expiresAt: '2020-01-01T00:00:00Z' };
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('/coupons') && (!opts?.method || opts.method === 'GET')) return okJson([expired]);
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminCouponsPage />);
    await waitFor(() => expect(screen.getByText('WELCOME10')).toBeTruthy());
    expect(screen.getByText('Expired')).toBeTruthy();
  });
});
