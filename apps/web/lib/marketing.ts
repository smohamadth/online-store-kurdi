'use client';

import { http } from './http';

/**
 * Marketing API client (bundles, email capture, newsletter).
 *
 * Mirrors `apps/api/src/modules/marketing/`. Capture and subscribe are
 * fire-and-forget from the UI's point of view - a failed marketing call must
 * never block a shopper - so they resolve to a boolean rather than throwing.
 */

export interface BundleItem {
  productId: string;
  quantity: number;
  name: string | null;
  price: number;
}

export interface Bundle {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  items: BundleItem[];
  /** Sum of the components at list price. */
  itemsTotal: number;
  /** What the customer pays for the set. */
  bundlePrice: number;
  savings: number;
  /** 0..1 */
  savingsPercent: number;
  /** False when any component is out of stock or inactive. */
  available: boolean;
}

export type CaptureTrigger = 'exit_intent' | 'timed' | 'inline';

/** Active bundles for the storefront. Never throws: an empty list is fine. */
export async function getBundles(): Promise<Bundle[]> {
  try {
    const res = await http.get<Bundle[]>('/bundles');
    return res.data || [];
  } catch {
    return [];
  }
}

export async function getBundle(slug: string): Promise<Bundle | null> {
  try {
    const res = await http.get<Bundle>(`/bundles/${encodeURIComponent(slug)}`);
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Record an email capture from the popup.
 *
 * Resolves false rather than throwing: the popup is a marketing surface, and
 * an API hiccup must not surface as a broken-looking error to a shopper who
 * was only half-interested to begin with.
 */
export async function captureEmail(
  email: string,
  trigger: CaptureTrigger = 'exit_intent',
): Promise<boolean> {
  try {
    await http.post('/marketing/capture', { email, trigger });
    return true;
  } catch {
    return false;
  }
}

/** Footer / inline newsletter signup. */
export async function subscribeNewsletter(
  email: string,
  source: 'footer' | 'checkout' | 'popup' | 'inline' = 'footer',
): Promise<boolean> {
  try {
    await http.post('/newsletter/subscribe', { email, source });
    return true;
  } catch {
    return false;
  }
}
