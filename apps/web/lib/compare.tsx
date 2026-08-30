'use client';

/**
 * Compare list - a small, localStorage-backed store of products the
 * customer wants to compare side by side (the /compare page).
 *
 * Mirrors the CartProvider pattern on purpose: no server round-trip to
 * select items (the list is a UI concern that must survive navigation
 * and refreshes), a bounded length (4 columns is the practical max for
 * a readable comparison table), and a minimal stub per item so the
 * compare bar can render without any fetch. The /compare page fetches
 * the full products by slug when it actually renders the table.
 */

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

export interface CompareItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  /** First image URL (via getImageUrl on the producer side). */
  image?: string | null;
}

interface CompareStore {
  items: CompareItem[];
  isCompared: (productId: string) => boolean;
  toggle: (item: CompareItem) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const MAX_COMPARE = 4;
const STORAGE_KEY = 'compareList';

const CompareContext = createContext<CompareStore | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setItems(parsed.slice(0, MAX_COMPARE));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full/blocked: comparison still works in-memory for
      // this tab; nothing to surface to the customer.
    }
  }, [items, mounted]);

  const isCompared = (productId: string) => items.some((i) => i.id === productId);

  const toggle = (item: CompareItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) {
        return prev.filter((i) => i.id !== item.id);
      }
      if (prev.length >= MAX_COMPARE) return prev; // 4 columns max
      return [...prev, item];
    });
  };

  const remove = (productId: string) => setItems((prev) => prev.filter((i) => i.id !== productId));
  const clear = () => setItems([]);

  return (
    <CompareContext.Provider value={{ items, isCompared, toggle, remove, clear }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare(): CompareStore {
  const ctx = useContext(CompareContext);
  if (!ctx) {
    throw new Error('useCompare must be used inside a CompareProvider');
  }
  return ctx;
}

export const MAX_COMPARE_ITEMS = MAX_COMPARE;
