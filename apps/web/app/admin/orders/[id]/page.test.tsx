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
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('shows Refund order for a completed order and calls POST /payments/refund', async () => {
    const completedOrder = { ...codOrder, paymentStatus: 'completed', status: 'processing' };
    const refundedOrder = { ...codOrder, paymentStatus: 'refunded', status: 'refunded' };
    // First load: completed order. After the refund POST, the page reloads the
    // order and now sees the server's refunded state.
    hoisted.api.getOrder
      .mockResolvedValueOnce({ data: completedOrder })
      .mockResolvedValueOnce({ data: refundedOrder });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminOrderDetailPage />);

    await waitFor(() => expect(screen.getByText('Refund order')).toBeTruthy());
    // Mark as paid must NOT show for an already-completed order.
    expect(screen.queryByText('Mark as paid')).toBeNull();

    screen.getByText('Refund order').click();
    await waitFor(() => expect(hoisted.authHttp.post).toHaveBeenCalled());

    expect(hoisted.authHttp.post.mock.calls[0][0]).toBe('/payments/refund');
    expect(hoisted.authHttp.post.mock.calls[0][1]).toMatchObject({ orderId: 'o-1', reason: 'Admin refund' });

    // Refund button disappears and the order shows refunded (after reload).
    await waitFor(() => expect(screen.queryByText('Refund order')).toBeNull());
    expect(screen.getAllByText('refunded').length).toBeGreaterThan(0);
    confirmSpy.mockRestore();
  });

  it('sends a partial refund amount when one is entered', async () => {
    const completedOrder = { ...codOrder, paymentStatus: 'completed', status: 'processing' };
    hoisted.api.getOrder.mockResolvedValue({ data: completedOrder });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminOrderDetailPage />);

    await waitFor(() => expect(screen.getByText('Refund order')).toBeTruthy());
    const amountInput = screen.getByPlaceholderText(/Refund amount/);
    fireEvent.change(amountInput, { target: { value: '10.00' } });
    screen.getByText('Refund order').click();

    await waitFor(() => expect(hoisted.authHttp.post).toHaveBeenCalled());
    expect(hoisted.authHttp.post.mock.calls[0][1]).toMatchObject({ orderId: 'o-1', amount: 10, reason: 'Admin refund' });
    confirmSpy.mockRestore();
  });

  it('does not call the refund endpoint when the admin cancels the confirmation', async () => {
    const completedOrder = { ...codOrder, paymentStatus: 'completed', status: 'processing' };
    hoisted.api.getOrder.mockResolvedValue({ data: completedOrder });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AdminOrderDetailPage />);

    await waitFor(() => expect(screen.getByText('Refund order')).toBeTruthy());
    screen.getByText('Refund order').click();

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(hoisted.authHttp.post).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows Refund but NOT Mark as paid for a partially_refunded order', async () => {
    const partiallyRefunded = { ...codOrder, paymentStatus: 'partially_refunded', status: 'processing' };
    hoisted.api.getOrder.mockResolvedValue({ data: partiallyRefunded });
    render(<AdminOrderDetailPage />);

    await waitFor(() => expect(screen.getByText('Refund order')).toBeTruthy());
    // A partially-refunded order is already paid — "Mark as paid" must not show.
    expect(screen.queryByText('Mark as paid')).toBeNull();
  });
});
