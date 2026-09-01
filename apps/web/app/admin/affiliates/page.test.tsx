/**
 * Component test for the admin affiliates manager.
 *
 * Mocks the API client (lib/affiliates) and the settings fetch, and asserts
 * the three work areas (affiliates / commissions / payouts) plus program
 * settings save. Balance math and transitions are covered by the API
 * integration tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminAffiliatesPage from './page';

const mockListAffiliates = vi.fn();
const mockApproveAffiliate = vi.fn();
const mockSuspendAffiliate = vi.fn();
const mockSetRate = vi.fn();
const mockListCommissions = vi.fn();
const mockApproveCommission = vi.fn();
const mockRejectCommission = vi.fn();
const mockListPayouts = vi.fn();
const mockApprovePayout = vi.fn();
const mockRejectPayout = vi.fn();
vi.mock('@/lib/affiliates', () => ({
  listAffiliates: (...a: unknown[]) => mockListAffiliates(...a),
  approveAffiliate: (...a: unknown[]) => mockApproveAffiliate(...a),
  suspendAffiliate: (...a: unknown[]) => mockSuspendAffiliate(...a),
  setAffiliateRate: (...a: unknown[]) => mockSetRate(...a),
  listCommissions: (...a: unknown[]) => mockListCommissions(...a),
  approveCommission: (...a: unknown[]) => mockApproveCommission(...a),
  rejectCommission: (...a: unknown[]) => mockRejectCommission(...a),
  listPayouts: (...a: unknown[]) => mockListPayouts(...a),
  approvePayout: (...a: unknown[]) => mockApprovePayout(...a),
  rejectPayout: (...a: unknown[]) => mockRejectPayout(...a),
}));

const mockSettingsGet = vi.fn();
const mockSettingsPut = vi.fn();
vi.mock('@/lib/http', () => ({
  authHttp: {
    get: (...a: unknown[]) => mockSettingsGet(...a),
    put: (...a: unknown[]) => mockSettingsPut(...a),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  errorMessage: (_err: unknown, fallback: string) => fallback,
}));

const PENDING_AFFILIATE = {
  id: 'a1',
  userId: 'u1',
  code: 'MARTIN-7K2F',
  status: 'pending',
  rateOverride: null,
  totalEarned: 0,
  totalPaid: 0,
  clicks: 3,
  createdAt: '2026-08-01T00:00:00Z',
  user: { id: 'u1', email: 'martin@test.local', firstName: 'Martin', lastName: 'Kurdi' },
};

const PENDING_COMMISSION = {
  id: 'c1',
  affiliateId: 'a1',
  orderId: 'o1',
  orderNumber: 'ORD-100',
  orderAmount: 200,
  rate: 10,
  amount: 20,
  status: 'pending',
  currency: 'USD',
  createdAt: '2026-08-05T00:00:00Z',
  affiliate: {
    id: 'a1',
    code: 'MARTIN-7K2F',
    user: { email: 'martin@test.local', firstName: 'Martin', lastName: 'Kurdi' },
  },
};

const PENDING_PAYOUT = {
  id: 'p1',
  affiliateId: 'a1',
  amount: 20,
  status: 'pending',
  currency: 'USD',
  notes: null,
  adminNotes: null,
  requestedAt: '2026-08-06T00:00:00Z',
  resolvedAt: null,
  affiliate: {
    id: 'a1',
    code: 'MARTIN-7K2F',
    user: { email: 'martin@test.local', firstName: 'Martin', lastName: 'Kurdi' },
  },
};

describe('Admin affiliates page', () => {
  beforeEach(() => {
    mockListAffiliates.mockReset();
    mockApproveAffiliate.mockReset();
    mockSuspendAffiliate.mockReset();
    mockSetRate.mockReset();
    mockListCommissions.mockReset();
    mockApproveCommission.mockReset();
    mockRejectCommission.mockReset();
    mockListPayouts.mockReset();
    mockApprovePayout.mockReset();
    mockRejectPayout.mockReset();
    mockSettingsGet.mockReset();
    mockSettingsPut.mockReset();

    mockListAffiliates.mockResolvedValue([]);
    mockListCommissions.mockResolvedValue([]);
    mockListPayouts.mockResolvedValue([]);
    mockSettingsGet.mockResolvedValue({ data: { affiliateEnabled: false, affiliateRate: 10 } });
  });

  it('loads the current program settings into the form', async () => {
    mockSettingsGet.mockResolvedValue({ data: { affiliateEnabled: true, affiliateRate: 7.5 } });
    render(<AdminAffiliatesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('affiliate-enabled')).toBeChecked();
    });
    expect(screen.getByTestId('affiliate-rate')).toHaveValue(7.5);
  });

  it('saves program settings via PUT /api/settings', async () => {
    render(<AdminAffiliatesPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('affiliate-enabled'));
    fireEvent.change(screen.getByTestId('affiliate-rate'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mockSettingsPut).toHaveBeenCalledWith('/settings', {
        affiliateEnabled: true,
        affiliateRate: 15,
      });
      expect(screen.getByText(/affiliate program enabled/i)).toBeInTheDocument();
    });
  });

  it('lists pending affiliates and approves them', async () => {
    mockListAffiliates.mockResolvedValue([PENDING_AFFILIATE]);
    mockApproveAffiliate.mockResolvedValue({ ...PENDING_AFFILIATE, status: 'active' });

    render(<AdminAffiliatesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('affiliates-table')).toBeInTheDocument();
    });
    expect(screen.getByText('martin@test.local')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => {
      expect(mockApproveAffiliate).toHaveBeenCalledWith('a1');
    });
  });

  it('suspends an active affiliate', async () => {
    mockListAffiliates.mockResolvedValue([{ ...PENDING_AFFILIATE, status: 'active' }]);
    render(<AdminAffiliatesPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /suspend/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /suspend/i }));
    await waitFor(() => {
      expect(mockSuspendAffiliate).toHaveBeenCalledWith('a1');
    });
  });

  it('approves and rejects pending commissions', async () => {
    mockListCommissions.mockResolvedValue([PENDING_COMMISSION]);
    render(<AdminAffiliatesPage />);
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /commissions \(1 pending\)/i }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('commissions-table')).toBeInTheDocument();
    });
    expect(screen.getByText('ORD-100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => {
      expect(mockApproveCommission).toHaveBeenCalledWith('c1');
    });

    mockRejectCommission.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    await waitFor(() => {
      expect(mockRejectCommission).toHaveBeenCalledWith('c1');
    });
  });

  it('marks a payout paid and rejects another', async () => {
    // First load returns two pending payouts; every load after approval
    // returns p1 as paid so the table shows only p2 with actions.
    mockListPayouts
      .mockResolvedValueOnce([PENDING_PAYOUT, { ...PENDING_PAYOUT, id: 'p2', amount: 5 }])
      .mockResolvedValue([
        { ...PENDING_PAYOUT, id: 'p1', status: 'paid' },
        { ...PENDING_PAYOUT, id: 'p2', amount: 5 },
      ]);
    render(<AdminAffiliatesPage />);
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /payouts \(2 pending\)/i }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('payouts-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /mark paid/i })[0]);
    await waitFor(() => {
      expect(mockApprovePayout).toHaveBeenCalledWith('p1');
    });

    // The page refreshes after the action: p1 is paid (no actions), so
    // exactly one actionable row (p2) remains — reject it.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /mark paid/i })).toHaveLength(1);
    });
    fireEvent.click(screen.getAllByRole('button', { name: /^reject$/i })[0]);
    await waitFor(() => {
      expect(mockRejectPayout).toHaveBeenCalledWith('p2');
    });
  });
});
