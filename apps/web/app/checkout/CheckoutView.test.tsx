/**
 * Checkout wallet-credit UI tests.
 *
 * Covers the wallet pieces of the checkout page:
 *   1. the store-credit balance is fetched at mount and shown;
 *   2. a zero balance never renders a "-$0.00 Store credit" summary line;
 *   3. a PARTIAL wallet credit combined with an online gateway blocks
 *      Place Order and shows the amber warning — and, the regression:
 *      the wallet inputs stay ENABLED so the customer can uncheck/clear
 *      (they were disabled once, which trapped customers who selected
 *      credit under COD and then switched to a card method);
 *   4. FULL wallet coverage with a gateway is allowed (submit enabled,
 *      no warning), mirroring the server rule;
 *   5. the gift-card Check flow shows the balance with the store's
 *      currency symbol, and the order payload carries applyStoreCredit
 *      + the trimmed giftCardCode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CheckoutView from './CheckoutView';

const cart = vi.hoisted(() => ({
  items: [] as any[],
  getTotal: vi.fn(),
  clearCart: vi.fn(),
}));
const api = vi.hoisted(() => ({ createOrder: vi.fn() }));
const authHttp = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
// Stable identity: CheckoutView's mount effect lists `router` in its deps,
// so a fresh object per render would re-run the effect forever.
const router = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(),
  refresh: vi.fn(), prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));
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
      // One enabled hosted gateway so the radio list offers a card method.
      paymentGateways: [{ id: 'stripe', label: 'Card', enabled: true, country: 'US' }],
    },
  }),
  formatPrice: (n: number, symbol = '$') => `${symbol}${Number(n).toFixed(2)}`,
}));
// ShippingSelector and TaxCalculator are fetched by the page; the tests
// drive the shipping selection with a button so the submit button's
// enabled state reflects wallet rules rather than a missing method.
vi.mock('@/components/ShippingSelector', () => ({
  default: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ id: 'standard', name: 'Standard', rate: 5 })}>
      Pick shipping
    </button>
  ),
}));
vi.mock('@/components/TaxCalculator', () => ({ default: () => null }));

function setup() {
  localStorage.clear();
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ id: 'u1', firstName: 'Sara', email: 'sara@example.com' }));
  cart.items = [{ id: 'i1', productId: 'p1', name: 'Widget', price: 50, quantity: 1, type: 'physical' }];
  cart.getTotal.mockReset().mockReturnValue(50);
  cart.clearCart.mockReset();
  api.createOrder.mockReset();
  api.createOrder.mockResolvedValue({ data: { orderNumber: 'ORD-123', id: 'o1', checkoutUrl: null } });
  authHttp.get.mockReset();
  authHttp.post.mockReset();
  authHttp.get.mockResolvedValue({ data: { balance: 0, currency: 'USD' } });
}

// happy-dom does not dispatch form submission when a type="submit" button
// is clicked, so submit through the form element directly.
function submitOrder() {
  const button = screen.getByRole('button', { name: 'Place Order' }) as HTMLButtonElement;
  const form = button.closest('form')!;
  fireEvent.submit(form);
  return button;
}

describe('checkout wallet credit', () => {
  beforeEach(setup);

  it('fetches and shows the store-credit balance at mount', async () => {
    authHttp.get.mockResolvedValue({ data: { balance: 12.5, currency: 'USD' } });
    render(<CheckoutView />);

    await screen.findByText(/balance \$12\.50/);
    expect(authHttp.get).toHaveBeenCalledWith('/store-credit');
  });

  it('never renders a store-credit summary line for a zero balance', async () => {
    render(<CheckoutView />);
    await screen.findByText('Use my store credit');
    screen.getByRole('checkbox').click();

    await waitFor(() => expect(screen.queryByText('Store credit')).toBeNull());
  });

  it('blocks a partial wallet credit with an online gateway, but keeps the inputs enabled so the customer can uncheck (no dead-end)', async () => {
    authHttp.get.mockResolvedValue({ data: { balance: 10, currency: 'USD' } });
    render(<CheckoutView />);

    // Switch to the hosted gateway, pick shipping, then apply credit.
    screen.getByRole('radio', { name: /card/i }).click();
    screen.getByText('Pick shipping').click();
    await screen.findByText(/balance \$10\.00/);
    const checkbox = screen.getByRole('checkbox');
    checkbox.click();

    // Amber warning + disabled submit labelled with the remedy.
    await screen.findByText(/can't be combined with a partial wallet credit/i);
    const submit = screen.getByRole('button', { name: 'Choose another payment method' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    // The regression: the wallet inputs are NOT disabled for gateways,
    // so the customer can release the block without reloading.
    expect((checkbox as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByPlaceholderText('Gift card code') as HTMLInputElement).disabled).toBe(false);

    // Unchecking releases the block and re-enables Place Order.
    checkbox.click();
    await waitFor(() => expect(screen.queryByText(/can't be combined/i)).toBeNull());
    const enabled = screen.getByRole('button', { name: 'Place Order' }) as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
  });

  it('allows FULL wallet coverage with an online gateway (settles with no gateway session)', async () => {
    authHttp.get.mockResolvedValue({ data: { balance: 100, currency: 'USD' } });
    render(<CheckoutView />);

    screen.getByRole('radio', { name: /card/i }).click();
    screen.getByText('Pick shipping').click();
    await screen.findByText(/balance \$100\.00/);
    screen.getByRole('checkbox').click();

    // Total 60 (50 + 5 tax fallback + 5 shipping) is fully covered.
    await screen.findByText('Amount due');
    expect(screen.queryByText(/can't be combined/i)).toBeNull();
    const submit = screen.getByRole('button', { name: 'Place Order' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('rejects a gift card in a different currency instead of adding its balance', async () => {
    authHttp.get.mockResolvedValue({ data: { balance: 0, currency: 'USD' } });
    authHttp.post.mockResolvedValue({
      data: { code: 'abcd-1234', availableBalance: 20, currency: 'EUR', redeemable: true },
    });
    render(<CheckoutView />);

    const input = screen.getByPlaceholderText('Gift card code');
    fireEvent.change(input, { target: { value: 'abcd-1234' } });
    screen.getByRole('button', { name: 'Check' }).click();

    // The card is refused with an explanation; no balance is added to the
    // estimate and no summary line appears.
    await screen.findByText(/This gift card is in EUR, but this store sells in USD\./);
    expect(screen.queryByText(/Gift card \(/)).toBeNull();
  });

  it('checks a gift card, shows its balance, and sends the code + store credit in the order payload', async () => {
    authHttp.get.mockResolvedValue({ data: { balance: 10, currency: 'USD' } });
    authHttp.post.mockResolvedValue({
      data: { code: 'abcd-1234', availableBalance: 20, currency: 'USD', redeemable: true },
    });
    render(<CheckoutView />);

    // Check the code: confirmation line uses the store's currency symbol.
    const input = screen.getByPlaceholderText('Gift card code');
    fireEvent.change(input, { target: { value: ' abcd-1234 ' } });
    screen.getByRole('button', { name: 'Check' }).click();
    await screen.findByText(/✓ ABCD-1234 — \$20\.00 available/);

    // Summary shows the gift card line and an amount due.
    await screen.findByText('Gift card (ABCD-1234)');
    await screen.findByText('Amount due');

    // Place the order: the payload carries the toggle + trimmed code.
    screen.getByText('Pick shipping').click();
    screen.getByRole('checkbox').click();
    submitOrder();

    await screen.findByText('Order Placed Successfully!');
    expect(api.createOrder).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ applyStoreCredit: true, giftCardCode: 'abcd-1234' }),
    );
  });
});
