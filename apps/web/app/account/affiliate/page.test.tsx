/**
 * Component test for the account affiliate dashboard.
 *
 * Mocks the API client (lib/affiliates) and asserts the page's state
 * machine: disabled program / apply / pending / active dashboard with
 * stats, commissions and payout request. Heavy flows are covered by the
 * API integration tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AffiliatePage from './page';

const mockGetMyAffiliate = vi.fn();
const mockApplyAffiliate = vi.fn();
const mockGetMyCommissions = vi.fn();
const mockGetMyPayouts = vi.fn();
const mockRequestPayout = vi.fn();
vi.mock('@/lib/affiliates', () => ({
  getMyAffiliate: (...a: unknown[]) => mockGetMyAffiliate(...a),
  applyAffiliate: (...a: unknown[]) => mockApplyAffiliate(...a),
  getMyCommissions: (...a: unknown[]) => mockGetMyCommissions(...a),
  getMyPayouts: (...a: unknown[]) => mockGetMyPayouts(...a),
  requestPayout: (...a: unknown[]) => mockRequestPayout(...a),
  buildAffiliateLink: (code: string) => `https://store.test/?ref=${code}`,
}));
vi.mock('@/lib/http', () => ({
  authHttp: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  errorMessage: (_err: unknown, fallback: string) => fallback,
}));

const ACTIVE = {
  id: 'a1',
  userId: 'u1',
  code: 'MARTIN-7K2F',
  status: 'active',
  rateOverride: null,
  totalEarned: 30,
  totalPaid: 0,
  clicks: 5,
  createdAt: '2026-08-01T00:00:00Z',
};

const STATS = {
  clicks: 5,
  referredOrders: 2,
  pendingCommissions: 1,
  pendingEarnings: 10,
  approvedEarnings: 30,
  paidOut: 0,
  available: 30,
};

describe('Account affiliate page', () => {
  beforeEach(() => {
    mockGetMyAffiliate.mockReset();
    mockApplyAffiliate.mockReset();
    mockGetMyCommissions.mockReset();
    mockGetMyPayouts.mockReset();
    mockRequestPayout.mockReset();
    mockGetMyCommissions.mockResolvedValue([]);
    mockGetMyPayouts.mockResolvedValue([]);
  });

  it('shows the unavailable card when the program is disabled', async () => {
    mockGetMyAffiliate.mockResolvedValue({ programEnabled: false, affiliate: null });
    render(<AffiliatePage />);
    await waitFor(() => {
      expect(screen.getByText(/does not currently offer an affiliate program/i)).toBeInTheDocument();
    });
  });

  it('offers an apply card before joining', async () => {
    mockGetMyAffiliate.mockResolvedValue({ programEnabled: true, affiliate: null });
    render(<AffiliatePage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply to the program/i })).toBeInTheDocument();
    });
  });

  it('applies and then shows the pending state', async () => {
    mockGetMyAffiliate
      .mockResolvedValueOnce({ programEnabled: true, affiliate: null })
      .mockResolvedValueOnce({
        programEnabled: true,
        affiliate: { ...ACTIVE, status: 'pending' },
      });
    render(<AffiliatePage />);
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /apply to the program/i }));
    });
    await waitFor(() => {
      expect(mockApplyAffiliate).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/application under review/i)).toBeInTheDocument();
    });
  });

  it('shows the active dashboard with the share link, stats and commissions', async () => {
    mockGetMyAffiliate.mockResolvedValue({ programEnabled: true, affiliate: ACTIVE, stats: STATS });
    mockGetMyCommissions.mockResolvedValue([
      {
        id: 'c1',
        affiliateId: 'a1',
        orderId: 'o1',
        orderNumber: 'ORD-1',
        orderAmount: 100,
        rate: 10,
        amount: 10,
        status: 'pending',
        currency: 'USD',
        createdAt: '2026-08-01T00:00:00Z',
      },
      {
        id: 'c2',
        affiliateId: 'a1',
        orderId: 'o2',
        orderNumber: 'ORD-2',
        orderAmount: 200,
        rate: 10,
        amount: 30,
        status: 'approved',
        currency: 'USD',
        createdAt: '2026-08-02T00:00:00Z',
      },
    ]);
    mockGetMyPayouts.mockResolvedValue([
      { id: 'p1', affiliateId: 'a1', amount: 15, status: 'paid', currency: 'USD', notes: null, adminNotes: null, requestedAt: '2026-08-03T00:00:00Z', resolvedAt: '2026-08-04T00:00:00Z' },
    ]);

    render(<AffiliatePage />);

    await waitFor(() => {
      expect(screen.getByTestId('affiliate-link')).toHaveValue('https://store.test/?ref=MARTIN-7K2F');
    });
    // Stats grid (approved and available are both 30.00 here).
    expect(screen.getByText('5')).toBeInTheDocument(); // clicks
    expect(screen.getAllByText('30.00').length).toBeGreaterThan(0);
    // Commissions table.
    expect(screen.getByTestId('commission-table')).toBeInTheDocument();
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
    expect(screen.getByText('ORD-2')).toBeInTheDocument();
    // Payout history.
    expect(screen.getByText('15.00')).toBeInTheDocument();
  });

  it('requests a payout with the entered amount', async () => {
    mockGetMyAffiliate.mockResolvedValue({ programEnabled: true, affiliate: ACTIVE, stats: STATS });
    mockRequestPayout.mockResolvedValue({ id: 'p2', amount: 20 });
    mockGetMyPayouts.mockResolvedValue([]);

    render(<AffiliatePage />);
    await waitFor(() => {
      expect(screen.getByTestId('payout-amount')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('payout-amount'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /request payout/i }));

    await waitFor(() => {
      expect(mockRequestPayout).toHaveBeenCalledWith(20);
      expect(screen.getByText(/payout requested/i)).toBeInTheDocument();
    });
  });

  it('shows the suspended notice', async () => {
    mockGetMyAffiliate.mockResolvedValue({
      programEnabled: true,
      affiliate: { ...ACTIVE, status: 'suspended' },
      stats: STATS,
    });
    render(<AffiliatePage />);
    await waitFor(() => {
      expect(screen.getByText(/affiliate account is suspended/i)).toBeInTheDocument();
    });
  });
});
