/**
 * Admin Payments page — verifies it lists the configured gateways from the
 * API, renders each gateway's credential fields, saves via PUT and clears
 * via DELETE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminPaymentsPage from './page';

const mocks = vi.hoisted(() => ({
  authHttp: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/http', () => ({
  authHttp: mocks.authHttp,
  errorMessage: (e: any) => e?.message || String(e),
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD', currencySymbol: '$', paymentGateways: [] } }),
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));

vi.mock('@/lib/hooks', () => ({
  useIsMobile: () => false,
}));

const definitions = [
  {
    id: 'zarinpal',
    name: 'Zarinpal',
    label: 'Zarinpal',
    country: 'IR',
    description: 'Iranian gateway',
    currencyHint: 'IRR',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', type: 'password', required: true, secret: true },
      { key: 'sandbox', label: 'Sandbox mode', type: 'boolean' },
    ],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    label: 'PayPal',
    country: 'global',
    description: 'International',
    fields: [{ key: 'clientId', label: 'Client ID', type: 'text', required: true, secret: true }],
  },
];

describe('AdminPaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    mocks.authHttp.get.mockResolvedValue({
      status: 'success',
      data: { gateways: { zarinpal: { enabled: true, merchantId: 'm1' } }, definitions },
    });
    mocks.authHttp.put.mockResolvedValue({ status: 'success', data: {} });
    mocks.authHttp.delete.mockResolvedValue({ status: 'success', data: {} });
  });

  it('renders each gateway with its credential fields', async () => {
    render(<AdminPaymentsPage />);
    await waitFor(() => expect(screen.getByText('Zarinpal')).toBeTruthy());
    expect(screen.getByText('PayPal')).toBeTruthy();
    // Enabled gateway shows a checked toggle; a credential input exists.
    const merchantIdInput = screen.getByPlaceholderText('Merchant ID') as HTMLInputElement;
    expect(merchantIdInput.value).toBe('m1');
  });

  it('saves a gateway via PUT', async () => {
    render(<AdminPaymentsPage />);
    await waitFor(() => expect(screen.getByText('Zarinpal')).toBeTruthy());
    const saveButtons = screen.getAllByText('Save');
    saveButtons[0].click();
    await waitFor(() => expect(mocks.authHttp.put).toHaveBeenCalled());
    expect(mocks.authHttp.put.mock.calls[0][0]).toBe('/settings/payment-gateways');
    expect(mocks.authHttp.put.mock.calls[0][1].gateways.zarinpal.enabled).toBe(true);
  });

  it('clears a gateway via DELETE', async () => {
    render(<AdminPaymentsPage />);
    await waitFor(() => expect(screen.getByText('Zarinpal')).toBeTruthy());
    const clearButtons = screen.getAllByText('Clear');
    clearButtons[0].click();
    await waitFor(() => expect(mocks.authHttp.delete).toHaveBeenCalled());
    expect(mocks.authHttp.delete.mock.calls[0][0]).toBe('/settings/payment-gateways/zarinpal');
  });
});
