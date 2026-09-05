import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Page from './page';

vi.mock('@/lib/http', () => ({
  authHttp: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  errorMessage: (e: unknown, f: string) => (e instanceof Error ? e.message : f),
}));

import { authHttp } from '@/lib/http';

describe('Admin currencies page', () => {
  beforeEach(() => {
    vi.mocked(authHttp.get).mockResolvedValue({
      status: 'success',
      data: [{ id: 'c1', code: 'EUR', name: 'Euro', symbol: '€', rateToBase: 0.9, isEnabled: true }],
    } as any);
    vi.mocked(authHttp.post).mockResolvedValue({ status: 'success', data: {} } as any);
    vi.mocked(authHttp.put).mockResolvedValue({ status: 'success', data: {} } as any);
  });

  it('lists currencies from GET /currencies/all and can add one', async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText('Euro')).toBeTruthy());
    expect(authHttp.get).toHaveBeenCalledWith('/currencies/all');
    fireEvent.change(screen.getByPlaceholderText('USD'), { target: { value: 'GBP' } });
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Pound' } });
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: '£' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() =>
      expect(authHttp.post).toHaveBeenCalledWith(
        '/currencies',
        expect.objectContaining({ code: 'GBP', name: 'Pound', symbol: '£' }),
      ),
    );
  });
});
