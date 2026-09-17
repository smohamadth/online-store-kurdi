/**
 * Checkout regressions found in the project-wide audit.
 *
 *   1. A calculated tax of EXACTLY 0 (tax-free region / no tax rules) was
 *      treated as "no calculation" by `taxInfo?.taxAmount || subtotal * 0.1`,
 *      so the summary showed a 10% estimate the server never charges. The
 *      customer agreed to a total that does not exist.
 *
 *   2. A customer returning from a hosted gateway (?gateway=..&order=..) has
 *      an empty cart by design — it is cleared when the order is placed. The
 *      empty-cart guard bounced them to /cart before the verification banner
 *      could render, so a real payment looked lost.
 */
import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CheckoutView from './CheckoutView';

const cart = vi.hoisted(() => ({
  items: [] as any[],
  getTotal: vi.fn(),
  clearCart: vi.fn(),
}));
const api = vi.hoisted(() => ({ createOrder: vi.fn() }));
const authHttp = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const router = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(),
  refresh: vi.fn(), prefetch: vi.fn(),
}));
// The mocked TaxCalculator reports whatever this holds, so a test can hand
// the page a genuine zero-tax calculation.
const tax = vi.hoisted(() => ({ value: null as any }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/store', () => ({
  useCart: () => ({ items: cart.items, getTotal: cart.getTotal, clearCart: cart.clearCart }),
}));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/http', () => ({ authHttp }));
vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({
    settings: {
      currency: 'USD',
      currencySymbol: '$',
      paymentGateways: [{ id: 'stripe', label: 'Card', enabled: true, country: 'US' }],
    },
  }),
  formatPrice: (n: number, symbol = '$') => `${symbol}${Number(n).toFixed(2)}`,
}));
vi.mock('@/components/ShippingSelector', () => ({
  default: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ id: 'standard', name: 'Standard', rate: 0 })}>
      Pick shipping
    </button>
  ),
}));
vi.mock('@/components/TaxCalculator', () => ({
  default: ({ onTaxCalculated }: any) => {
    useEffect(() => {
      if (tax.value) onTaxCalculated(tax.value);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  },
}));

function setup() {
  localStorage.clear();
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ id: 'u1', firstName: 'Sara', email: 'sara@example.com' }));
  cart.items = [{ id: 'i1', productId: 'p1', name: 'Widget', price: 50, quantity: 1, type: 'physical' }];
  cart.getTotal.mockReset().mockReturnValue(50);
  cart.clearCart.mockReset();
  api.createOrder.mockReset();
  authHttp.get.mockReset().mockResolvedValue({ data: { balance: 0, currency: 'USD' } });
  authHttp.post.mockReset();
  tax.value = null;
  router.push.mockReset();
  window.history.replaceState({}, '', '/checkout');
}

describe('checkout totals', () => {
  beforeEach(setup);

  it('shows a real zero tax instead of falling back to the 10% estimate', async () => {
    tax.value = { taxRate: 0, taxName: 'Tax', taxAmount: 0, subtotal: 50, totalWithTax: 50 };
    render(<CheckoutView />);

    // Subtotal 50, free shipping, zero tax -> the order total is $50.00.
    // Before the fix it was $55.00 (a phantom 10% the server never charges).
    // Subtotal and total both render $50.00 (two nodes) once tax is 0.
    await waitFor(() => expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('$55.00')).toBeNull();
  });

  it('still estimates tax when no calculation has arrived', async () => {
    tax.value = null;
    render(<CheckoutView />);
    // No calculation at all -> the 10% estimate still applies: 50 + 5 = $55.00.
    await screen.findByText('$55.00');
  });
});

describe('hosted gateway return', () => {
  beforeEach(setup);

  it('renders the verification banner instead of bouncing an empty cart to /cart', async () => {
    cart.items = [];
    cart.getTotal.mockReturnValue(0);
    window.history.replaceState({}, '', '/checkout?gateway=zarinpal&order=o1&Authority=A1&Status=OK');
    authHttp.post.mockResolvedValue({ data: { success: true, message: 'Payment confirmed.' } });

    render(<CheckoutView />);

    await screen.findByText(/Payment confirmed/);
    expect(router.push).not.toHaveBeenCalledWith('/cart');
    expect(authHttp.post).toHaveBeenCalledWith('/payments/gateways/zarinpal/verify', {
      orderId: 'o1',
      callbackParams: { Authority: 'A1', Status: 'OK' },
    });
  });

  it('still redirects a plain empty cart to /cart', async () => {
    cart.items = [];
    cart.getTotal.mockReturnValue(0);
    render(<CheckoutView />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/cart'));
  });
});
