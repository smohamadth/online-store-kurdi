/**
 * ShowcaseRow — the category showcase block (type "showcaseRow").
 *
 * The block fetches one category's products itself, so the tests stub the
 * products fetch and check the grid + view-all link render, and that the
 * row hides itself until a category is configured.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import ShowcaseRow from './ShowcaseRow';

const product = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Summer dress',
  slug: 'summer-dress',
  price: 49.9,
  images: [{ url: '', alt: '' }],
  ...over,
});

interface FetchMock {
  mock: { calls: [string, ...unknown[]][] };
}

function okFetch(data: unknown): FetchMock {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'success', data }),
  })) as unknown as FetchMock;
}

/** The first fetch call whose URL matches, as a string. */
function urlOfCalls(fetchMock: FetchMock, needle: string): string {
  return fetchMock.mock.calls.find(([u]) => u.includes(needle))?.[0] ?? '';
}

describe('ShowcaseRow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides itself until a category is configured', () => {
    const { container } = renderWithProviders(<ShowcaseRow category="" />);
    expect(container.querySelector('[data-section="showcase"]')).toBeNull();
  });

  it('fetches the category products and renders cards + view-all link', async () => {
    const fetchMock = okFetch([product()]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <ShowcaseRow
        title="The summer range"
        category="clothing"
        limit={4}
        viewAllText="See the range"
        currencySymbol="$"
      />
    );
    expect(await screen.findByText('Summer dress')).toBeTruthy();
    expect(screen.getByText('The summer range')).toBeTruthy();
    const link = screen.getByText('See the range').closest('a');
    expect(link?.getAttribute('href')).toBe('/category/clothing');
    // The request went to the products listing with the category + limit.
    const url = urlOfCalls(fetchMock, '/products?');
    expect(url).toContain('category=clothing');
    expect(url).toContain('limit=4');
  });

  it('shows an empty state when the category has no products', async () => {
    vi.stubGlobal('fetch', okFetch([]));
    renderWithProviders(<ShowcaseRow category="empty-cat" />);
    expect(await screen.findByText(/No products in this category yet/i)).toBeTruthy();
  });

  it('clears its products when the category is removed', async () => {
    vi.stubGlobal('fetch', okFetch([product()]));
    const { rerender, container } = renderWithProviders(<ShowcaseRow category="clothing" />);
    await waitFor(() => expect(container.textContent).toContain('Summer dress'));
    rerender(<ShowcaseRow category="" />);
    await waitFor(() =>
      expect(container.querySelector('[data-section="showcase"]')).toBeNull()
    );
  });
});
