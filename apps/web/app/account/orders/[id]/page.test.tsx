/**
 * Account order detail — the "Pay now" action for an unpaid online-payment
 * order. A customer who cancelled a gateway payment is left with a pending
 * order; this pins that the page offers a way to re-open the hosted payment
 * page (POST /orders/:id/pay) and redirect there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import OrderDetailPage from './page';

const mocks = vi.hoisted(() => ({
  api: { getOrder: vi.fn(), getOrderTracking: vi.fn() },
  authHttp: { post: vi.fn() },
  settings: { currency: 'USD', currencySymbol: '$' },
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<any>('@/lib/api');
  return { ...actual, api: { ...actual.api, getOrder: mocks.api.getOrder, getOrderTracking: mocks.api.getOrderTracking } };
});
vi.mock('@/lib/http', () => ({
  authHttp: mocks.authHttp,
  errorMessage: (e: any) => e?.message || String(e),
}));
vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: mocks.settings }),
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'o-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderNumber: '1001',
    status: 'pending',
    paymentMethod: 'zarinpal',
    paymentStatus: 'pending',
    subtotal: 49.99,
    totalAmount: 59.99,
    taxAmount: 5,
    shippingAmount: 5,
    discountAmount: 0,
    createdAt: '2024-04-01T10:00:00Z',
    shippingAddress: { firstName: 'S', lastName: 'K', address: '1', city: 'C', state: 'S', zipCode: '1', country: 'IQ' },
    items: [],
    ...overrides,
  };
}

describe('Account order detail Pay now', () => {
  beforeEach(() => {
    mocks.api.getOrder.mockReset();
    mocks.api.getOrderTracking.mockReset();
    mocks.authHttp.post.mockReset();
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', firstName: 'Sara', email: 'sara@example.com' }));
    mocks.api.getOrder.mockResolvedValue({ data: makeOrder() });
    mocks.api.getOrderTracking.mockResolvedValue({ data: null });
    mocks.authHttp.post.mockResolvedValue({ data: { checkoutUrl: 'https://pay.example/1' } });
  });

  it('shows Pay now for a pending online-payment order and calls the pay endpoint', async () => {
    render(<OrderDetailPage />);

    await waitFor(() => expect(screen.getByText('Pay now')).toBeTruthy());
    screen.getByText('Pay now').click();

    await waitFor(() => expect(mocks.authHttp.post).toHaveBeenCalled());
    expect(mocks.authHttp.post.mock.calls[0][0]).toBe('/orders/o-1/pay');
  });

  it('does not show Pay now for a completed order', async () => {
    mocks.api.getOrder.mockResolvedValue({ data: makeOrder({ paymentStatus: 'completed', status: 'processing' }) });
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('completed')).toBeTruthy());
    expect(screen.queryByText('Pay now')).toBeNull();
  });
});
