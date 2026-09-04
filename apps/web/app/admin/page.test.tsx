import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminDashboard from './page';

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currencySymbol: '$' } }),
  formatPrice: (n: number, s: string) => `${s}${n}`,
}));

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminDashboard', () => {
  it('does not hang on loading when there is no token', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText(/API Disconnected/)).toBeTruthy());
    expect(screen.queryByText(/Loading dashboard/)).toBeNull();
  });
});
