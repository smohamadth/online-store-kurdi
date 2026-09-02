/**
 * ShippingSelector — verifies the checkout sends the real cart
 * item count and total weight to POST /api/shipping/calculate, so
 * item_count- and weight-based methods price correctly (they used to
 * be hardcoded to weight:1 / itemCount:1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ShippingSelector from './ShippingSelector';

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD', currencySymbol: '$' } }),
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));

describe('ShippingSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  it('sends the real item count and total weight to the calculator', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'm1', name: 'Per Item', type: 'item_count', rate: 17,
            isFree: false, minDeliveryDays: 3, maxDeliveryDays: 5,
          },
        ],
      }),
    });
    (global.fetch as any) = fetchMock;

    render(
      <ShippingSelector
        country="US"
        subtotal={120}
        itemCount={4}
        weight={9.5}
        onSelect={() => {}}
      />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = fetchMock.mock.calls[0][0];
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(String(url)).toContain('/shipping/calculate');
    expect(body.itemCount).toBe(4);
    expect(body.weight).toBe(9.5);

    // The offered method (which needed itemCount=4 to price at $17)
    // shows up in the list.
    await waitFor(() => expect(screen.getByText(/Per Item/)).toBeTruthy());
  });

  it('falls back to a default weight/itemCount of 1 when none provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    (global.fetch as any) = fetchMock;

    render(
      <ShippingSelector
        country="US"
        subtotal={50}
        onSelect={() => {}}
      />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.itemCount).toBe(1);
    expect(body.weight).toBe(1);
  });
});
