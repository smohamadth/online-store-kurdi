/**
 * "Frequently bought together" bundle offer.
 *
 * The behaviours worth pinning: never advertise a deal that cannot be
 * completed, never invent a price the server will not honour, and add every
 * component so stock and shipping behave normally.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BundleOffer from './BundleOffer';
import type { Bundle } from '@/lib/marketing';

const mockGetBundles = vi.fn();
vi.mock('@/lib/marketing', () => ({
  getBundles: () => mockGetBundles(),
}));

const mockAddItem = vi.fn();
vi.mock('@/lib/store', () => ({
  useCart: () => ({ addItem: mockAddItem, items: [] }),
}));

function bundle(over: Partial<Bundle> = {}): Bundle {
  return {
    id: 'b1',
    name: 'Starter Kit',
    slug: 'starter-kit',
    description: null,
    isActive: true,
    discountType: 'percentage',
    discountValue: 25,
    items: [
      { productId: 'p1', quantity: 1, name: 'Widget', price: 60 },
      { productId: 'p2', quantity: 1, name: 'Gadget', price: 40 },
    ],
    itemsTotal: 100,
    bundlePrice: 75,
    savings: 25,
    savingsPercent: 0.25,
    available: true,
    ...over,
  };
}

beforeEach(() => {
  mockGetBundles.mockReset();
  mockAddItem.mockReset();
  mockGetBundles.mockResolvedValue([bundle()]);
});

describe('rendering', () => {
  it('shows the bundle with its components', async () => {
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    expect(screen.getByText('Starter Kit')).toBeTruthy();
    expect(screen.getByText('Widget')).toBeTruthy();
    expect(screen.getByText('Gadget')).toBeTruthy();
  });

  it('shows the server-computed prices verbatim', async () => {
    // The component must never derive its own price: a stale client showing a
    // discount the server will not honour is a customer-visible lie.
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    expect(screen.getByTestId('bundle-was-starter-kit').textContent).toBe('$100.00');
    expect(screen.getByTestId('bundle-now-starter-kit').textContent).toBe('$75.00');
    expect(screen.getByTestId('bundle-save-starter-kit').textContent).toContain('$25.00');
  });

  it('renders nothing when there are no bundles', async () => {
    // An empty "Frequently bought together" heading is worse than silence.
    mockGetBundles.mockResolvedValue([]);
    const { container } = render(<BundleOffer />);
    await waitFor(() => expect(mockGetBundles).toHaveBeenCalled());
    expect(screen.queryByTestId('bundle-offer')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing while loading', () => {
    mockGetBundles.mockReturnValue(new Promise(() => {}));
    render(<BundleOffer />);
    expect(screen.queryByTestId('bundle-offer')).toBeNull();
  });

  it('survives the API failing', async () => {
    // getBundles already swallows errors and returns []; assert the component
    // does not crash the product page regardless.
    mockGetBundles.mockResolvedValue([]);
    expect(() => render(<BundleOffer />)).not.toThrow();
    await waitFor(() => expect(screen.queryByTestId('bundle-offer')).toBeNull());
  });

  it('hides the savings line when there is no saving', async () => {
    mockGetBundles.mockResolvedValue([bundle({ savings: 0, bundlePrice: 100 })]);
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    expect(screen.queryByTestId('bundle-save-starter-kit')).toBeNull();
  });

  it('shows a quantity multiplier only when above one', async () => {
    mockGetBundles.mockResolvedValue([
      bundle({
        items: [
          { productId: 'p1', quantity: 3, name: 'Widget', price: 10 },
          { productId: 'p2', quantity: 1, name: 'Gadget', price: 40 },
        ],
      }),
    ]);
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    expect(screen.getByText(/Widget × 3/)).toBeTruthy();
    expect(screen.getByText('Gadget')).toBeTruthy();
  });

  it('multiplies the line total by quantity', async () => {
    mockGetBundles.mockResolvedValue([
      bundle({ items: [{ productId: 'p1', quantity: 3, name: 'Widget', price: 10 }] }),
    ]);
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    expect(screen.getByText('$30.00')).toBeTruthy();
  });

  it('honours a custom currency symbol', async () => {
    render(<BundleOffer currencySymbol="£" />);
    await screen.findByTestId('bundle-offer');
    expect(screen.getByTestId('bundle-now-starter-kit').textContent).toBe('£75.00');
  });
});

describe('filtering', () => {
  it('hides unavailable bundles', async () => {
    // Advertising a deal the shopper cannot complete is worse than showing
    // nothing at all.
    mockGetBundles.mockResolvedValue([bundle({ available: false })]);
    render(<BundleOffer />);
    await waitFor(() => expect(mockGetBundles).toHaveBeenCalled());
    expect(screen.queryByTestId('bundle-offer')).toBeNull();
  });

  it('shows only bundles containing the given product', async () => {
    mockGetBundles.mockResolvedValue([
      bundle({ id: 'a', slug: 'has-it' }),
      bundle({
        id: 'b',
        slug: 'other',
        items: [
          { productId: 'zz', quantity: 1, name: 'Other', price: 5 },
          { productId: 'yy', quantity: 1, name: 'Thing', price: 5 },
        ],
      }),
    ]);
    render(<BundleOffer productId="p1" />);
    await screen.findByTestId('bundle-offer');
    expect(screen.getByTestId('bundle-has-it')).toBeTruthy();
    expect(screen.queryByTestId('bundle-other')).toBeNull();
  });

  it('shows every bundle when no product is given', async () => {
    mockGetBundles.mockResolvedValue([
      bundle({ id: 'a', slug: 'one' }),
      bundle({ id: 'b', slug: 'two' }),
    ]);
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    expect(screen.getByTestId('bundle-one')).toBeTruthy();
    expect(screen.getByTestId('bundle-two')).toBeTruthy();
  });

  it('caps the number rendered', async () => {
    mockGetBundles.mockResolvedValue([
      bundle({ id: 'a', slug: 'one' }),
      bundle({ id: 'b', slug: 'two' }),
      bundle({ id: 'c', slug: 'three' }),
    ]);
    render(<BundleOffer max={2} />);
    await screen.findByTestId('bundle-offer');
    expect(screen.getByTestId('bundle-one')).toBeTruthy();
    expect(screen.getByTestId('bundle-two')).toBeTruthy();
    expect(screen.queryByTestId('bundle-three')).toBeNull();
  });
});

describe('adding to cart', () => {
  it('adds every component as its own line', async () => {
    // Separate lines keep stock, shipping weight and fulfilment behaving
    // normally; a single synthetic "bundle" line would break all three.
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    fireEvent.click(screen.getByTestId('bundle-add-starter-kit'));

    expect(mockAddItem).toHaveBeenCalledTimes(2);
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p1', quantity: 1, price: 60 }),
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p2', quantity: 1, price: 40 }),
    );
  });

  it('adds each component at LIST price, not a pre-discounted one', async () => {
    // The bundle discount is applied server-side at checkout. Discounting the
    // lines here as well would double-count it.
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    fireEvent.click(screen.getByTestId('bundle-add-starter-kit'));

    const prices = mockAddItem.mock.calls.map((c) => c[0].price);
    expect(prices).toEqual([60, 40]);
    expect(prices.reduce((a, b) => a + b, 0)).toBe(100); // itemsTotal, not 75
  });

  it('carries the component quantity', async () => {
    mockGetBundles.mockResolvedValue([
      bundle({ items: [{ productId: 'p1', quantity: 4, name: 'Widget', price: 10 }] }),
    ]);
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    fireEvent.click(screen.getByTestId('bundle-add-starter-kit'));

    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ quantity: 4 }));
  });

  it('confirms after adding', async () => {
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    const btn = screen.getByTestId('bundle-add-starter-kit');
    expect(btn.textContent).toBe('Add all to cart');

    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByTestId('bundle-add-starter-kit').textContent).toBe('Added to cart'));
  });

  it('only confirms on the bundle that was clicked', async () => {
    mockGetBundles.mockResolvedValue([
      bundle({ id: 'a', slug: 'one' }),
      bundle({ id: 'b', slug: 'two' }),
    ]);
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    fireEvent.click(screen.getByTestId('bundle-add-one'));

    await waitFor(() =>
      expect(screen.getByTestId('bundle-add-one').textContent).toBe('Added to cart'));
    expect(screen.getByTestId('bundle-add-two').textContent).toBe('Add all to cart');
  });

  it('falls back to a name when the API sends null', async () => {
    mockGetBundles.mockResolvedValue([
      bundle({ items: [{ productId: 'p1', quantity: 1, name: null, price: 10 }] }),
    ]);
    render(<BundleOffer />);
    await screen.findByTestId('bundle-offer');
    fireEvent.click(screen.getByTestId('bundle-add-starter-kit'));
    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Item' }));
  });
});
