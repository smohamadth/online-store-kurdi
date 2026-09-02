/**
 * /compare page - the comparison table.
 *
 * The selection is seeded through localStorage (the CompareProvider
 * reads it on mount, exactly like a returning customer). The API is
 * mocked so each column resolves to a known product; one column is
 * made to fail to prove a broken product doesn't sink the table.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import ComparePage from '@/app/compare/page';
import { CompareProvider } from '@/lib/compare';

const product = (slug: string, price: number) => ({
  id: `id-${slug}`,
  name: `Product ${slug}`,
  slug,
  price,
  quantity: 5,
  averageRating: 4,
  reviewCount: 10,
  shortDescription: `The ${slug} product.`,
  description: '',
  images: [],
  category: { name: 'Test Cat', slug: 'test-cat' },
});

let nextProduct = product('a', 10);
vi.mock('@/lib/api', () => ({
  api: {
    getProductBySlug: vi.fn(async (slug: string) => {
      if (slug === 'broken') throw new Error('boom');
      return { data: nextProduct };
    }),
  },
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currencySymbol: '$' }, loading: false }),
  formatPrice: (p: number, sym = '$') => `${sym}${p}`,
}));

vi.mock('@/lib/theme', () => ({
  useTheme: () => ({ theme: {}, loading: false, reload: () => {}, activeTheme: 'default' }),
  ThemeProvider: ({ children }: any) => children,
}));

function seed(ids: string[]) {
  localStorage.setItem(
    'compareList',
    JSON.stringify(ids.map((id, i) => ({ id, name: `Product ${id}`, slug: id, price: 10 * (i + 1) })))
  );
}

function renderPage() {
  return render(
    <CompareProvider>
      <ComparePage />
    </CompareProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('/compare', () => {
  it('shows the empty state with a catalog link when nothing is selected', async () => {
    renderPage();
    expect(await screen.findByText('Nothing to compare yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse the catalog/i })).toHaveAttribute(
      'href',
      '/products'
    );
  });

  it('renders a table with a column per selected product (live data)', async () => {
    nextProduct = product('a', 12.5);
    seed(['a', 'broken']);
    renderPage();

    // Both column headers appear (one of them will degrade to "no longer
    // available" - the header still names the product the customer picked).
    expect(await screen.findByText('Product a')).toBeInTheDocument();
    expect(screen.getByText('Product broken')).toBeInTheDocument();

    // The good column carries the fetched live price + availability.
    await waitFor(() => expect(screen.getByText('$12.5')).toBeInTheDocument());
    expect(screen.getByText('5 in stock')).toBeInTheDocument();
    expect(screen.getByText('★ 4 (10)')).toBeInTheDocument();
    expect(screen.getByText('Test Cat')).toBeInTheDocument();

    // The broken column degrades gracefully instead of blanking the table.
    expect(screen.getByText('No longer available')).toBeInTheDocument();
    expect(screen.getByText('View product')).toBeInTheDocument();
  });

  it('offers per-column removal', async () => {
    nextProduct = product('a', 10);
    seed(['a', 'b']);
    renderPage();
    const buttons = await screen.findAllByText('Remove');
    expect(buttons).toHaveLength(2);
  });
});
