/**
 * AdminGiftCardsPage — issue / list / void gift cards.
 *
 * Verifies the card list renders code + balance + status, the issue form
 * POSTs a new card to /gift-cards, and cancelling an active card posts to
 * /gift-cards/:id/cancel after confirmation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminGiftCardsPage from './page';

vi.mock('@/lib/hooks', () => ({ useIsMobile: () => false }));

const card = {
  id: 'g1', code: 'A1B2-C3D4-E5F6-7890', initialAmount: 50, balance: 50,
  currency: 'USD', status: 'active', issuedAt: '2024-01-01T00:00:00Z',
  expiresAt: null, notes: null,
};

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminGiftCardsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  it('renders the card list with code, balance and status', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('/gift-cards') && (!opts?.method || opts.method === 'GET')) return okJson([card]);
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminGiftCardsPage />);
    await waitFor(() => expect(screen.getByText('A1B2-C3D4-E5F6-7890')).toBeTruthy());
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy(); // initial amount (with currency)
  });

  it('issues a new gift card via the form', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('/gift-cards') && (!opts?.method || opts.method === 'GET')) return okJson([]);
      if (String(url).includes('/gift-cards') && opts?.method === 'POST') return okJson({ ...card, code: 'NEW-CODE' });
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminGiftCardsPage />);
    await waitFor(() => expect(screen.getByText('+ Issue card')).toBeTruthy());
    screen.getByText('+ Issue card').click();
    await waitFor(() => expect(screen.getByTestId('gc-submit')).toBeTruthy());

    fireEvent.change(screen.getByTestId('gc-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('gc-currency'), { target: { value: 'EUR' } });
    screen.getByTestId('gc-submit').click();

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/gift-cards'),
        expect.objectContaining({ method: 'POST' })
      )
    );
    const postCall = (global.fetch as any).mock.calls.find((c: any) => c[1]?.method === 'POST');
    expect(JSON.parse(postCall[1].body)).toMatchObject({ amount: 100, currency: 'EUR' });
  });

  it('cancels an active card after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/gift-cards') && (!opts?.method || opts.method === 'GET')) return okJson([card]);
      if (u.includes('/gift-cards/g1/cancel') && opts?.method === 'POST') return okJson({ ...card, status: 'cancelled' });
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminGiftCardsPage />);
    await waitFor(() => expect(screen.getByText('A1B2-C3D4-E5F6-7890')).toBeTruthy());

    screen.getByTestId('cancel-A1B2-C3D4-E5F6-7890').click();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/gift-cards/g1/cancel'),
        expect.objectContaining({ method: 'POST' })
      )
    );
  });
});
