/**
 * RecentlyViewed - the home-page "recently viewed" row.
 *
 * - renders nothing when the list is empty (no empty section)
 * - renders one card per recently-viewed product, newest first
 * - links each card to its product page
 *
 * ProductCard is mocked to a stub (it's covered by its own suite);
 * the settings hook is mocked so no API call happens.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act as actSafe } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import RecentlyViewed from '@/components/RecentlyViewed';
import { trackRecentlyViewed, useRecentlyViewed } from '@/lib/recentlyViewed';
import type { Product } from '@/lib/api';

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currencySymbol: '$' }, loading: false }),
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));

vi.mock('@/components/ProductCard', () => ({
  default: ({ product, currencySymbol }: { product: Product; currencySymbol: string }) => (
    <a href={`/products/${product.slug}`} data-testid={`card-${product.id}`}>
      {product.name}
    </a>
  ),
}));

function product(id: string): Product {
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
    images: [],
    category: { id: 'c', name: 'Cat', slug: 'cat', image: null },
    variants: [],
    averageRating: 0,
    reviewCount: 0,
    downloadUrl: null,
    downloadLimit: null,
    downloadExpiry: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('RecentlyViewed', () => {
  it('renders nothing when nothing has been viewed', () => {
    const { container } = renderWithProviders(<RecentlyViewed />);
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders one card per viewed product, newest first, linked to the product', () => {
    actSafe(() => trackRecentlyViewed(product('a')));
    actSafe(() => trackRecentlyViewed(product('b')));
    const { container } = renderWithProviders(<RecentlyViewed />);
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(screen.getByText('Recently viewed')).toBeInTheDocument();
    const cards = Array.from(container.querySelectorAll('a[href^="/products/"]'));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('href', '/products/slug-b');
    expect(cards[1]).toHaveAttribute('href', '/products/slug-a');
    expect(screen.getByText('Product b')).toBeInTheDocument();
    expect(screen.getByText('Product a')).toBeInTheDocument();
  });
});
