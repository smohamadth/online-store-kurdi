/**
 * Component tests for the /products listing page's debounced search.
 *
 * Regression for a performance bug: the search box previously called setFilter
 * on every keystroke, which pushed a history entry AND fired two network
 * requests (products + facets) per character. The fix keeps the input
 * responsive but only commits the debounced term into the filter, so typing a
 * whole word results in a single settled refetch rather than one per char.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import ProductsPage from './page';

// The page consumes several providers/modules that pull network data. We stub
// the ones that would otherwise fire unrelated fetches so the assertions below
// can focus on the products/facets calls the search box drives.
vi.mock('@/lib/api', () => ({
  api: {},
  Product: class {},
  Category: class {},
  getImageUrl: (u: string) => u,
  getCategoryEmoji: () => '🛍️',
  getProductImage: (img: any) => img?.url || '',
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currencySymbol: '$' }, loading: false }),
}));

vi.mock('@/lib/filterParams', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/filterParams')>();
  return {
    ...actual,
  };
});

vi.mock('@/lib/structured-data', () => ({
  buildItemListJsonLd: () => ({}),
  buildBreadcrumbJsonLd: () => ({}),
  asGraph: (x: unknown) => x,
}));

vi.mock('@/lib/seo', () => ({ SITE: 'http://localhost' }));

vi.mock('@/lib/layouts/useActiveLayout', () => ({ useActiveLayout: () => null }));
vi.mock('@/lib/layouts/render', () => ({ LayoutRenderer: () => null }));

// FilterSidebar / ProductCard render network/context heavy children; a plain
// stub keeps the test focused on fetch call-counting.
vi.mock('@/components/ProductCard', () => ({
  default: ({ product }: any) => <div data-testid="card">{product.name}</div>,
}));
vi.mock('@/components/FilterSidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

const productRows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Product ${i}`,
    slug: `product-${i}`,
    price: i + 1,
    status: 'active',
    images: [],
    category: { id: 'c', name: 'Cat', slug: 'cat' },
  }));

function installFetchMock() {
  const calls: { url: string; method?: string }[] = [];
  const fn = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method });
    if (u.includes('/products/facets')) {
      return { ok: true, status: 200, json: () => Promise.resolve({ data: null }) };
    }
    if (u.includes('/products?') || u.includes('/products')) {
      return {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: productRows(3),
            pagination: { page: 1, limit: 9, total: 3, totalPages: 1 },
          }),
      };
    }
    return { ok: true, status: 200, json: () => Promise.resolve({ data: [] }) };
  });
  (global as any).fetch = fn;
  return { fn, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe('/products debounced search', () => {
  it('does not refetch on every keystroke - only after the debounce settles', async () => {
    const { calls } = installFetchMock();

    render(<ProductsPage />);

    // Initial load happens once.
    await act(async () => {
      await Promise.resolve();
    });

    const input = screen.getByLabelText('Search products') as HTMLInputElement;

    // Type a whole word fast, as a burst of characters.
    act(() => {
      fireEvent.change(input, { target: { value: 's' } });
      fireEvent.change(input, { target: { value: 'sh' } });
      fireEvent.change(input, { target: { value: 'sho' } });
      fireEvent.change(input, { target: { value: 'shor' } });
      fireEvent.change(input, { target: { value: 'short' } });
    });

    // Advance the debounce past its 350ms window so the single settled value
    // gets committed into the filter.
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    // Flush any pending microtasks/effect chains.
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    const productListCalls = calls.filter(
      (c) => c.url.includes('/products') && !c.url.includes('/products/facets'),
    );
    // Initial load + one debounced search commit, NOT one per character.
    expect(productListCalls.length).toBe(2);
  });

  it('commits the last settled value after a typing burst', async () => {
    const { calls } = installFetchMock();

    render(<ProductsPage />);
    await act(async () => {
      await Promise.resolve();
    });

    const input = screen.getByLabelText('Search products') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'ab' } });
      fireEvent.change(input, { target: { value: 'abc' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    const searchCall = calls.find(
      (c) => c.url.includes('/products') && c.url.includes('search=abc'),
    );
    expect(searchCall).toBeTruthy();
  });
});
