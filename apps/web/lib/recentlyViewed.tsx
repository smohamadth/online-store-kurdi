'use client';

/**
 * Recently viewed products - a localStorage-backed, per-browser list of
 * the last products the customer opened, shown on the home page.
 *
 * Deliberately client-side only (no server): it's a personalization
 * convenience keyed to the browser, not to the account, and it must
 * work while logged out. The cap (8) keeps the home section a scannable
 * row rather than a second catalog.
 *
 * Same-tab sync uses a custom event (two components on the same page),
 * cross-tab sync uses the native `storage` event.
 */

import { useState, useEffect } from 'react';
import type { Product } from '@/lib/api';

export interface RecentlyViewedItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  image?: string | null;
  category?: string;
  // Carried so the home row renders true stock/type state instead of
  // guessing (a sold-out product must not show an enabled Add button).
  quantity?: number;
  type?: string;
  compareAtPrice?: number | null;
  averageRating?: number;
  reviewCount?: number;
}

export const MAX_RECENTLY_VIEWED = 8;
const STORAGE_KEY = 'recentlyViewed';
const SYNC_EVENT = 'recently-viewed-changed';

function readStore(): RecentlyViewedItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolerate half-written entries from older versions.
    return parsed
      .filter((p) => p && typeof p.id === 'string' && typeof p.slug === 'string')
      .slice(0, MAX_RECENTLY_VIEWED);
  } catch {
    return [];
  }
}

function writeStore(items: RecentlyViewedItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    // Notify other components on this tab (the `storage` event only
    // fires in OTHER tabs).
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {
    // Storage full/blocked: the section simply won't populate; nothing
    // to surface to the customer.
  }
}

/**
 * Record a product as viewed. Safe to call repeatedly for the same
 * product (it moves to the front, never duplicates).
 */
/**
 * Record a product as viewed. Safe to call repeatedly for the same
 * product (it moves to the front, never duplicates). Accepts the full
 * Product (from the API) - only the fields the home row needs are
 * kept, so the localStorage entry stays small.
 */
export function trackRecentlyViewed(product: Product | null | undefined) {
  if (!product || !product.id) return;
  const items = readStore().filter((p) => p.id !== product.id);
  items.unshift({
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    image: product.images?.[0]?.url ?? null,
    category: product.category?.name ?? undefined,
    quantity: product.quantity,
    type: product.type,
    compareAtPrice: product.compareAtPrice,
    averageRating: product.averageRating,
    reviewCount: product.reviewCount,
  });
  writeStore(items.slice(0, MAX_RECENTLY_VIEWED));
}

/**
 * React hook: the live list, kept in sync with storage across the tab
 * and across tabs. Returns an empty array on the server (the home
 * section renders nothing during SSR - the list is inherently
 * client-specific).
 */
export function useRecentlyViewed(): RecentlyViewedItem[] {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readStore());
    sync();
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return items;
}
