/**
 * SearchBar.
 *
 * The component is a debounced search input that calls /products/search
 * after the user types 2+ characters. The dropdown shows:
 *   - Recent searches (from localStorage)
 *   - Popular searches (the hardcoded list)
 *   - Search results
 *   - A "View all N results" link when the API returns more than 5
 *
 * Cover:
 *   - Submitting pushes /search?q=... and clears the input.
 *   - 2+ character debounce triggers a search.
 *   - Selecting a result routes to /products/<slug>.
 *   - Recent searches load from localStorage and dedupe on re-search.
 *   - Clear removes the recent list.
 *   - Popular searches are shown when input is empty and no recents exist.
 *   - Clicking outside closes the dropdown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { getNextRouter, setNextRouter } from '@/test/setup-components';
import SearchBar from '@/components/SearchBar';
import type { Product } from '@/lib/api';

const sampleProduct: Product = {
  id: 'p1',
  name: 'Wireless Mouse',
  slug: 'wireless-mouse',
  description: '',
  shortDescription: null,
  sku: 'M-1',
  type: 'physical',
  status: 'active',
  price: 25,
  compareAtPrice: null,
  quantity: 5,
  images: [],
  category: { id: 'c1', name: 'Electronics', slug: 'electronics', image: null },
  variants: [],
  averageRating: 0,
  reviewCount: 0,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

function mockFetchOk(json: any) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(json),
  });
}

function mockFetchFail() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ data: null }),
  });
}

beforeEach(() => {
  setNextRouter({ pathname: '/' });
  localStorage.clear();
});

describe('SearchBar', () => {
  it('renders an input with the placeholder', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i);
    expect(input).toBeInTheDocument();
  });

  it('shows popular search terms when input is empty and no recents', async () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i);
    act(() => {
      input.focus();
    });
    // iPhone, MacBook, T-Shirt, JavaScript, Course
    expect(await screen.findByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText('MacBook')).toBeInTheDocument();
  });

  it('hydrates recent searches from localStorage', async () => {
    localStorage.setItem('recentSearches', JSON.stringify(['shoes', 'hat']));
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i);
    act(() => {
      input.focus();
    });
    expect(await screen.findByText('shoes')).toBeInTheDocument();
    expect(screen.getByText('hat')).toBeInTheDocument();
  });

  it('Clear button removes recent searches from localStorage', async () => {
    localStorage.setItem('recentSearches', JSON.stringify(['shoes']));
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i);
    act(() => {
      input.focus();
    });
    const clearBtn = await screen.findByText('Clear');
    act(() => {
      clearBtn.click();
    });
    await waitFor(() => {
      expect(localStorage.getItem('recentSearches')).toBeNull();
    });
  });

  it('submitting a query routes to /search and persists the term', async () => {
    globalThis.fetch = mockFetchFail();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sneakers' } });
    fireEvent.submit(input.closest('form')!);

    expect(getNextRouter().pushedTo[0]).toBe('/search?q=sneakers');
    expect(input.value).toBe('');

    // The term is recorded as a recent search.
    const stored = JSON.parse(localStorage.getItem('recentSearches') || '[]');
    expect(stored).toContain('sneakers');
  });

  it('a 2+ char query debounces and hits the search API', async () => {
    globalThis.fetch = mockFetchOk({ data: [sampleProduct] });
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mouse' } });

    // Wait past the 300ms debounce.
    await waitFor(
      () => {
        expect(globalThis.fetch).toHaveBeenCalled();
        const url = (globalThis.fetch as any).mock.calls[0][0];
        expect(String(url)).toContain('/products/search');
        expect(String(url)).toContain('q=mouse');
      },
      { timeout: 1000 },
    );

    // The result is rendered.
    expect(await screen.findByText('Wireless Mouse')).toBeInTheDocument();
  });

  it('clicking a result navigates to /products/<slug>', async () => {
    globalThis.fetch = mockFetchOk({ data: [sampleProduct] });
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mouse' } });

    const result = await screen.findByText('Wireless Mouse');
    act(() => {
      result.click();
    });
    expect(getNextRouter().pushedTo.at(-1)).toBe('/products/wireless-mouse');
  });

  it('shows the "View all N results" link when more than 5 match', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...sampleProduct,
      id: `p${i}`,
      slug: `p-${i}`,
      name: `Result ${i}`,
    }));
    globalThis.fetch = mockFetchOk({ data: many });
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'res' } });

    const link = await screen.findByText(/View all 8 results/);
    act(() => {
      link.click();
    });
    expect(getNextRouter().pushedTo.at(-1)).toBe('/search?q=res');
  });

  it('shows a "no products found" message for an empty result set', async () => {
    globalThis.fetch = mockFetchOk({ data: [] });
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/search products/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'nothing' } });

    expect(await screen.findByText(/no products found for/i)).toBeInTheDocument();
  });
});
