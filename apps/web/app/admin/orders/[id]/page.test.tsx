/**
 * AdminOrderDetailPage — the staff end of the COD/bank-transfer flow.
 *
 * A customer who picks Cash on Delivery at checkout creates an order with
 * paymentStatus=pending and no checkoutUrl. Staff must then record that the
 * cash/transfer was collected. This test pins the "Mark as paid" button:
 *   - it appears only for a not-yet-completed order,
 *   - clicking it calls POST /api/payments/process with the order id,
 *   - it flips the displayed payment status to completed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminOrderDetailPage from './page';

const hoisted = vi.hoisted(() => ({
  api: { getOrder: vi.fn() },
  authHttp: { post: vi.fn() },
  settings: { currency: 'USD', currencySymbol: '$' },
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<any>('@/lib/api');
  return { ...actual, api: { ...actual.api, getOrder: hoisted.api.getOrder } };
});

vi.mock('@/lib/http', () => ({
  API_BASE: '',
  authHttp: hoisted.authHttp,
  errorMessage: (e: any) => e?.message || String(e),
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: hoisted.settings }),
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'o-1' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const codOrder = {
  id: 'o-1',
  orderNumber: '1001',
  status: 'pending',
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  subtotal: 49.99,
  totalAmount: 59.99,
  taxAmount: 5,
  shippingAmount: 5,
  discountAmount: 0,
  trackingNumber: '',
  adminNotes: '',
  items: [{ id: 'i1', name: 'Mouse', price: 49.99, quantity: 1 }],
};

describe('AdminOrderDetailPage payment settlement', () => {
  beforeEach(() => {
    hoisted.api.getOrder.mockReset();
    hoisted.authHttp.post.mockReset();
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    hoisted.api.getOrder.mockResolvedValue({ data: codOrder });
    hoisted.authHttp.post.mockResolvedValue({ status: 'success', data: {} });
  });

  it('shows Mark as paid for a pending COD order and records the payment', async () => {
    render(<AdminOrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Mark as paid')).toBeTruthy());

    screen.getByText('Mark as paid').click();
    await waitFor(() => expect(hoisted.authHttp.post).toHaveBeenCalled());

    expect(hoisted.authHttp.post.mock.calls[0][0]).toBe('/payments/process');
    expect(hoisted.authHttp.post.mock.calls[0][1]).toMatchObject({ orderId: 'o-1', paymentMethod: 'cod' });

    // After settling, the button disappears and the paid state shows.
    await waitFor(() =>
      expect(screen.queryByText('Mark as paid')).toBeNull(),
    );
    expect(screen.getByText('completed')).toBeTruthy();
  });
});
