'use client';

import { authHttp, http } from './http';

/**
 * Affiliate marketing API client (see docs/AFFILIATES_PLAN.md).
 *
 * Types mirror the API module `apps/api/src/modules/affiliates/`. The
 * database is the only source of truth; failures surface as ApiError so
 * the UI can show the server's message.
 */

export interface AffiliateProfile {
  id: string;
  userId: string;
  code: string;
  status: 'pending' | 'active' | 'suspended';
  rateOverride: number | null;
  totalEarned: number;
  totalPaid: number;
  clicks: number;
  createdAt: string;
}

export interface AffiliateStats {
  clicks: number;
  referredOrders: number;
  pendingCommissions: number;
  pendingEarnings: number;
  approvedEarnings: number;
  paidOut: number;
  available: number;
}

export interface AffiliateCommission {
  id: string;
  affiliateId: string;
  orderId: string;
  orderNumber: string;
  orderAmount: number;
  rate: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  currency: string;
  createdAt: string;
}

export interface AffiliateClick {
  id: string;
  affiliateId: string;
  ipHash: string | null;
  createdAt: string;
}

export interface AffiliatePayout {
  id: string;
  affiliateId: string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  currency: string;
  notes: string | null;
  adminNotes: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

export interface MyAffiliateView {
  programEnabled: boolean;
  affiliate: AffiliateProfile | null;
  stats?: AffiliateStats;
}

/** Shareable referral link for the current origin, e.g. https://store/?ref=CODE. */
export function buildAffiliateLink(code: string): string {
  const base =
    typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || '';
  return `${base}/?ref=${encodeURIComponent(code)}`;
}

// =====================================================================
// Public / visitor
// =====================================================================

/** Record a referral click and get the attribution cookie set. */
export async function trackAffiliateClick(code: string): Promise<{ valid: boolean; code: string }> {
  try {
    const res = await http.post<{ valid: boolean; code: string }>('/affiliates/track', { code });
    return res.data || { valid: false, code };
  } catch {
    // Tracking must never break a page load.
    return { valid: false, code };
  }
}

// =====================================================================
// Affiliate-facing
// =====================================================================

export async function getMyAffiliate(): Promise<MyAffiliateView> {
  const res = await authHttp.get<MyAffiliateView>('/affiliates/me');
  return res.data;
}

export async function applyAffiliate(): Promise<AffiliateProfile> {
  const res = await authHttp.post<AffiliateProfile>('/affiliates/apply', {});
  return res.data;
}

export async function getMyCommissions(): Promise<AffiliateCommission[]> {
  const res = await authHttp.get<AffiliateCommission[]>('/affiliates/me/commissions');
  return res.data || [];
}

export async function getMyClicks(): Promise<AffiliateClick[]> {
  const res = await authHttp.get<AffiliateClick[]>('/affiliates/me/clicks');
  return res.data || [];
}

export async function getMyPayouts(): Promise<AffiliatePayout[]> {
  const res = await authHttp.get<AffiliatePayout[]>('/affiliates/me/payouts');
  return res.data || [];
}

export async function requestPayout(amount?: number, notes?: string): Promise<AffiliatePayout> {
  const res = await authHttp.post<AffiliatePayout>('/affiliates/me/payouts', {
    amount,
    notes: notes || undefined,
  });
  return res.data;
}

// =====================================================================
// Admin
// =====================================================================

export interface AdminAffiliate extends AffiliateProfile {
  user: { id: string; email: string; firstName: string; lastName: string };
}

export async function listAffiliates(status?: string): Promise<AdminAffiliate[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await authHttp.get<AdminAffiliate[]>(`/affiliates${q}`);
  return res.data || [];
}

export async function approveAffiliate(id: string): Promise<AffiliateProfile> {
  const res = await authHttp.post<AffiliateProfile>(`/affiliates/${id}/approve`, {});
  return res.data;
}

export async function suspendAffiliate(id: string): Promise<AffiliateProfile> {
  const res = await authHttp.post<AffiliateProfile>(`/affiliates/${id}/suspend`, {});
  return res.data;
}

export async function setAffiliateRate(id: string, rateOverride: number | null): Promise<AffiliateProfile> {
  const res = await authHttp.put<AffiliateProfile>(`/affiliates/${id}/rate`, { rateOverride });
  return res.data;
}

export interface AdminCommission extends AffiliateCommission {
  affiliate: { id: string; code: string; user: { email: string; firstName: string; lastName: string } };
}

export async function listCommissions(status?: string): Promise<AdminCommission[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await authHttp.get<AdminCommission[]>(`/affiliates/commissions${q}`);
  return res.data || [];
}

export async function approveCommission(id: string): Promise<AffiliateCommission> {
  const res = await authHttp.post<AffiliateCommission>(`/affiliates/commissions/${id}/approve`, {});
  return res.data;
}

export async function rejectCommission(id: string): Promise<AffiliateCommission> {
  const res = await authHttp.post<AffiliateCommission>(`/affiliates/commissions/${id}/reject`, {});
  return res.data;
}

export interface AdminPayout extends AffiliatePayout {
  affiliate: { id: string; code: string; user: { email: string; firstName: string; lastName: string } };
}

export async function listPayouts(status?: string): Promise<AdminPayout[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await authHttp.get<AdminPayout[]>(`/affiliates/payouts${q}`);
  return res.data || [];
}

export async function approvePayout(id: string, adminNotes?: string): Promise<AffiliatePayout> {
  const res = await authHttp.post<AffiliatePayout>(`/affiliates/payouts/${id}/approve`, {
    adminNotes: adminNotes || undefined,
  });
  return res.data;
}

export async function rejectPayout(id: string, adminNotes?: string): Promise<AffiliatePayout> {
  const res = await authHttp.post<AffiliatePayout>(`/affiliates/payouts/${id}/reject`, {
    adminNotes: adminNotes || undefined,
  });
  return res.data;
}
