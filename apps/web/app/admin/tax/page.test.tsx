/**
 * AdminTaxPage — the tax rates + tax classes editor.
 *
 * Verifies the two tabs render, tax rates show with their percentage, and
 * the "Add Tax Rate" modal POSTs the rate to /tax/rates (dividing the
 * entered integer percent by 100 for the server's decimal fraction).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminTaxPage from './page';

vi.mock('@/lib/hooks', () => ({ useIsMobile: () => false }));

const rate = { id: 'tr1', name: 'VAT', rate: 0.2, country: 'UK', state: null, taxClass: 'standard', isActive: true };
const klass = { id: 'tc1', name: 'zero', description: 'Zero-rated goods', isDefault: false, _count: { products: 2 } };

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminTaxPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  it('renders tax rates with their percentage and switches to classes tab', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/tax/rates')) return okJson([rate]);
      if (u.includes('/tax/classes')) return okJson([klass]);
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminTaxPage />);
    await waitFor(() => expect(screen.getByText('VAT')).toBeTruthy());
    expect(screen.getByText('20.0%')).toBeTruthy();

    screen.getByText('Tax Classes').click();
    await waitFor(() => expect(screen.getByText('zero')).toBeTruthy());
    expect(screen.getByText('Zero-rated goods')).toBeTruthy();
  });

  it('adds a tax rate posting the integer percent as a decimal', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/tax/rates') && (!opts?.method || opts.method === 'GET')) return okJson([]);
      if (u.includes('/tax/classes')) return okJson([]);
      if (u.includes('/tax/rates') && opts?.method === 'POST') return okJson(rate);
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminTaxPage />);
    await waitFor(() => expect(screen.getByText('+ Add Tax Rate')).toBeTruthy());
    screen.getByText('+ Add Tax Rate').click();
    await waitFor(() => expect(screen.getByText('Add Tax Rate')).toBeTruthy());

    // The modal opens with rate=0. Set the number input (Rate) to 20.
    const rateInput = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(rateInput, { target: { value: '20' } });
    screen.getByText('Add Rate').click();

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tax/rates'),
        expect.objectContaining({ method: 'POST' })
      )
    );
    const postCall = (global.fetch as any).mock.calls.find((c: any) => c[1]?.method === 'POST' && String(c[0]).includes('/tax/rates'));
    expect(JSON.parse(postCall[1].body).rate).toBe(0.2);
  });
});
