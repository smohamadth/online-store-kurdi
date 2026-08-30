/**
 * AdminShippingPage — verifies the shipping method editor exposes all
 * four pricing types (flat / weight / price / item_count) and renders
 * zones + methods returned by the API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminShippingPage from './page';

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD', currencySymbol: '$' } }),
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));

vi.mock('@/lib/hooks', () => ({
  useIsMobile: () => false,
}));

describe('AdminShippingPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  it('renders zones and offers all four pricing types', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'z1', name: 'Domestic', countries: ['US'], isActive: true,
            methods: [
              {
                id: 'm1', name: 'Standard', type: 'flat', baseRate: 5.99,
                freeShippingThreshold: null, minDeliveryDays: 3, maxDeliveryDays: 5, isActive: true,
              },
            ],
          },
        ],
      }),
    });
    (global.fetch as any) = fetchMock;

    render(<AdminShippingPage />);

    await waitFor(() => expect(screen.getByText('Domestic')).toBeTruthy());
    expect(screen.getByText('Standard')).toBeTruthy();

    // Open the Add Method modal and confirm every pricing type is selectable.
    screen.getByText('+ Add Method').click();
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toEqual([
      'Flat rate',
      'Per weight',
      'Percentage of order',
      'Per item',
    ]);
  });
});
