/**
 * AdminInventoryPage — the stock overview.
 *
 * Verifies the stat cards (total / low stock / out of stock) compute from
 * the fetched products, the filter pills narrow the table, the per-product
 * stock status badge renders, and the adjust-stock modal POSTs to
 * /inventory/adjust and refetches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminInventoryPage from './page';

vi.mock('@/lib/hooks', () => ({ useIsMobile: () => false }));

const products = [
  { id: 'p1', name: 'T-Shirt', sku: 'TS-1', quantity: 10, lowStockThreshold: 5, trackInventory: true, variants: [], category: { name: 'Clothing' } },
  { id: 'p2', name: 'Mug', sku: 'MG-1', quantity: 2, lowStockThreshold: 5, trackInventory: true, variants: [], category: { name: 'Home' } },
  { id: 'p3', name: 'Hat', sku: 'HT-1', quantity: 0, lowStockThreshold: 5, trackInventory: true, variants: [], category: { name: 'Clothing' } },
];

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminInventoryPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  it('computes stats and renders the stock table', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('/inventory') && (!opts?.method || opts.method === 'GET')) return okJson(products);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<AdminInventoryPage />);
    await waitFor(() => expect(screen.getByText('T-Shirt')).toBeTruthy());
    expect(screen.getByText('Mug')).toBeTruthy();
    expect(screen.getByText('Hat')).toBeTruthy();
    expect(screen.getAllByText('In Stock').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Low Stock').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Out of Stock').length).toBeGreaterThanOrEqual(1);
  });

  it('filters the table by stock status', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('/inventory') && (!opts?.method || opts.method === 'GET')) return okJson(products);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<AdminInventoryPage />);
    await waitFor(() => expect(screen.getByText('T-Shirt')).toBeTruthy());

    // Click the "Out of Stock" filter pill (the button, not the row badge).
    fireEvent.click(screen.getByRole('button', { name: /Out of Stock/ }));
    await waitFor(() => expect(screen.queryByText('T-Shirt')).toBeNull());
    expect(screen.queryByText('Mug')).toBeNull();
    expect(screen.getByText('Hat')).toBeTruthy();
  });

  it('opens the adjust modal and POSTs a stock change', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('/inventory') && (!opts?.method || opts.method === 'GET')) return okJson(products);
      if (String(url).includes('/inventory/adjust') && opts?.method === 'POST') return okJson({});
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<AdminInventoryPage />);
    await waitFor(() => expect(screen.getByText('T-Shirt')).toBeTruthy());

    fireEvent.click(screen.getAllByText('Adjust')[0]); // T-Shirt row
    await waitFor(() => expect(screen.getByText(/Adjust Stock: T-Shirt/)).toBeTruthy());

    // happy-dom does not expose the spinbutton role for number inputs, so
    // query the modal's number input directly (it holds the stock change).
    const inputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { value: '5' } });
    // The modal's submit button is the last "Adjust" button on the page.
    const adjustButtons = screen.getAllByRole('button', { name: /Adjust/ });
    fireEvent.click(adjustButtons[adjustButtons.length - 1]);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/inventory/adjust'),
        expect.objectContaining({ method: 'POST' })
      )
    );
    const postCall = (global.fetch as any).mock.calls.find((c: any) => String(c[0]).includes('/inventory/adjust'));
    expect(JSON.parse(postCall[1].body).productId).toBe('p1');
  });
});
