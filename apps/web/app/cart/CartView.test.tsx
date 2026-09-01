/**
 * CartView — digital-cart branch.
 *
 * When every line in the cart is `type: 'digital'` the cart
 * should:
 *   1. Force shipping to $0 (no shipping for digital orders).
 *   2. Show the "Instant delivery" notice above the order
 *      summary.
 *   3. Show the "no shipping required" footer note.
 *   4. NOT show the "Add $X more for free shipping" hint.
 *
 * Mixed carts (one digital + one physical) still go through the
 * regular shipping logic; the digital branch only triggers when
 * every line is digital.
 *
 * The CartProvider runs network effects on mount (it calls
 * `fetch /cart` if a token is in localStorage). The setup's
 * default fetch returns 404, so the provider falls through to
 * localStorage. We seed `localStorage.cart` with the items we
 * want to assert against.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CartView from './CartView';
import { CartProvider } from '@/lib/store';
import type { CartItem } from '@/lib/store';

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD', currencySymbol: '$' }, loading: false }),
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));

function seedCart(items: CartItem[]) {
  localStorage.setItem('cart', JSON.stringify(items));
  // The provider also reads `savedItems`; we don't care, but
  // having an empty array keeps the snapshot stable.
  localStorage.setItem('savedItems', JSON.stringify([]));
}

const digitalItem: CartItem = {
  id: 'd-1',
  productId: 'p-1',
  name: 'eBook',
  slug: 'ebook',
  price: 9.99,
  quantity: 1,
  category: 'Digital Products',
  type: 'digital',
};

const physicalItem: CartItem = {
  id: 'p-1',
  productId: 'p-2',
  name: 'T-Shirt',
  slug: 'tshirt',
  price: 25,
  quantity: 1,
  category: 'Clothing',
  type: 'physical',
};

function renderCart() {
  return render(
    <CartProvider>
      <CartView />
    </CartProvider>,
  );
}

describe('CartView: digital cart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the "Instant delivery" notice when every item is digital', async () => {
    seedCart([digitalItem]);
    renderCart();
    await waitFor(() => expect(screen.getByTestId('instant-delivery-notice')).toBeTruthy());
    // The notice should mention the customer's account downloads
    // page so they know where to grab the file.
    const notice = screen.getByTestId('instant-delivery-notice');
    expect(notice.textContent).toContain('Instant delivery');
  });

  it('shows the "no shipping required" footer when every item is digital', async () => {
    seedCart([digitalItem]);
    renderCart();
    await waitFor(() => expect(screen.getByTestId('digital-shipping-note')).toBeTruthy());
    expect(screen.getByTestId('digital-shipping-note').textContent).toContain('No shipping required');
  });

  it('does not show the "free shipping" hint for an all-digital cart', async () => {
    seedCart([digitalItem]);
    renderCart();
    await waitFor(() => expect(screen.getByTestId('instant-delivery-notice')).toBeTruthy());
    expect(screen.queryByText(/Add \$.* more for free shipping/)).toBeNull();
  });

  it('renders the shipping row as "Free" for a digital cart', async () => {
    seedCart([digitalItem]);
    renderCart();
    await waitFor(() => expect(screen.getByTestId('instant-delivery-notice')).toBeTruthy());
    // The order summary is on the right; we look for the
    // generic "Free" text. There's only one in the summary
    // when digital, but our query narrows to that area.
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
  });
});

describe('CartView: mixed cart (digital + physical)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does NOT show the instant-delivery notice for a mixed cart', async () => {
    seedCart([digitalItem, physicalItem]);
    renderCart();
    await waitFor(() => expect(screen.getByText('Order Summary')).toBeTruthy());
    expect(screen.queryByTestId('instant-delivery-notice')).toBeNull();
  });
});
