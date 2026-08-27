/**
 * recentlyViewed - the storage-backed "recently viewed" list.
 *
 * trackRecentlyViewed is a pure localStorage writer; useRecentlyViewed
 * is the reactive reader. Both are exercised here without a browser
 * beyond happy-dom's localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { trackRecentlyViewed, useRecentlyViewed, MAX_RECENTLY_VIEWED } from '@/lib/recentlyViewed';
import type { Product } from '@/lib/api';

function product(id: string, over: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    slug: `slug-${id}`,
    description: '',
    shortDescription: null,
    sku: `SKU-${id}`,
    type: 'physical',
    status: 'active',
    price: 10,
    compareAtPrice: null,
    quantity: 5,
    images: [{ id: 'img', url: `/img-${id}.jpg`, alt: `Product ${id}`, isPrimary: true, sortOrder: 0 }],
    category: { id: 'c', name: 'Cat', slug: 'cat', image: null },
    variants: [],
    averageRating: 4,
    reviewCount: 3,
    downloadUrl: null,
    downloadLimit: null,
    downloadExpiry: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('trackRecentlyViewed', () => {
  it('records a product and persists it to localStorage', () => {
    act(() => trackRecentlyViewed(product('a')));
    const stored = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: 'a',
      name: 'Product a',
      slug: 'slug-a',
      price: 10,
      image: '/img-a.jpg',
      category: 'Cat',
    });
  });

  it('moves a re-viewed product to the front without duplicating', () => {
    act(() => trackRecentlyViewed(product('a')));
    act(() => trackRecentlyViewed(product('b')));
    act(() => trackRecentlyViewed(product('a')));
    const stored = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    expect(stored.map((p: any) => p.id)).toEqual(['a', 'b']);
  });

  it('keeps at most MAX_RECENTLY_VIEWED items (newest first)', () => {
    for (let i = 0; i < MAX_RECENTLY_VIEWED + 3; i++) {
      act(() => trackRecentlyViewed(product(`p${i}`)));
    }
    const stored = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    expect(stored).toHaveLength(MAX_RECENTLY_VIEWED);
    // Newest (p10) first, oldest (p0-p2) evicted.
    expect(stored[0].id).toBe('p10');
    expect(stored.map((p: any) => p.id)).not.toContain('p0');
  });

  it('tolerates corrupt storage', () => {
    localStorage.setItem('recentlyViewed', '{not json');
    act(() => trackRecentlyViewed(product('a')));
    const stored = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('a');
  });

  it('is a no-op for null/undefined', () => {
    act(() => trackRecentlyViewed(null));
    act(() => trackRecentlyViewed(undefined));
    expect(localStorage.getItem('recentlyViewed')).toBeNull();
  });
});

describe('useRecentlyViewed', () => {
  it('returns an empty list when nothing has been viewed', () => {
    const { result } = renderHook(() => useRecentlyViewed());
    expect(result.current).toEqual([]);
  });

  it('reflects previously viewed products on mount', () => {
    act(() => trackRecentlyViewed(product('a')));
    act(() => trackRecentlyViewed(product('b')));
    const { result } = renderHook(() => useRecentlyViewed());
    expect(result.current.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('updates in place when another component records a view (same tab)', () => {
    const { result } = renderHook(() => useRecentlyViewed());
    act(() => trackRecentlyViewed(product('a')));
    expect(result.current.map((p) => p.id)).toEqual(['a']);
    act(() => trackRecentlyViewed(product('b')));
    expect(result.current.map((p) => p.id)).toEqual(['b', 'a']);
  });
});
