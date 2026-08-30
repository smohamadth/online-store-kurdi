/**
 * AdminProductsPage - mobile responsiveness.
 *
 * The product list is a seven-column table and the add/edit modal is
 * 600px wide with three-column form rows. Both will overflow at
 * 360px-640px. The page must:
 *   - Allow horizontal scroll inside the table wrapper instead of
 *     overflowing the document.
 *   - Make the modal near-full-width with stacked form rows on phones.
 *   - Keep the form inputs usable: stacked to 1fr on mobile so each
 *     input gets the full viewport width.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import AdminProductsPage from './page';
import { setNextRouter } from '@/test/setup-components';

const sampleProducts = [
  {
    id: 'p-1',
    name: 'Test Mouse',
    slug: 'test-mouse',
    description: 'A test mouse',
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
  },
];

const sampleCategories = [
  { id: 'c1', name: 'Electronics', slug: 'electronics', image: null },
];

const hoisted = vi.hoisted(() => ({
  isMobile: false,
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<any>('@/lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getProducts: vi.fn(),
      getCategories: vi.fn(),
    },
  };
});

vi.mock('@/lib/hooks', () => ({
  useIsMobile: () => hoisted.isMobile,
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD', currencySymbol: '$', storeName: 'Test Store' }, loading: false }),
  formatPrice: (n: number, sym: string) => `${sym}${Number(n).toFixed(2)}`,
}));

// Stub heavy form children we don't care about for the layout test.
vi.mock('@/components/ImageGalleryUpload', () => ({
  default: () => <div data-testid="image-gallery-stub" />,
}));

vi.mock('@/components/RichTextEditor', () => ({
  default: ({ value, onChange }: any) => (
    <textarea
      data-testid="rich-text-stub"
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
  htmlToText: (s: string) => s || '',
}));

vi.mock('@/components/SeoPanel', () => ({
  default: () => <div data-testid="seo-panel-stub" />,
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, '-'),
  buildMetaTitle: (name: string) => name,
  buildMetaDescription: () => '',
  buildKeywords: () => [],
}));

beforeEach(async () => {
  setNextRouter({ pathname: '/admin/products' });
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ role: 'admin', firstName: 'Admin' }));
  hoisted.isMobile = false;
  const { api } = await import('@/lib/api');
  // The page only reads a handful of product fields, so a partial
  // fixture is enough. Cast through `any` so the helper types
  // (downloadUrl / downloadLimit / downloadExpiry are required for
  // current builds) don't force the test to repeat them.
  vi.mocked(api.getProducts).mockResolvedValue({ data: sampleProducts, status: 200 } as any);
  vi.mocked(api.getCategories).mockResolvedValue({ data: sampleCategories, status: 200 } as any);
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AdminProductsPage - list', () => {
  it('renders the products table on desktop with a horizontally scrollable wrapper', async () => {
    hoisted.isMobile = false;
    render(<AdminProductsPage />);
    await screen.findByText('Test Mouse');
    const tables = document.querySelectorAll('table');
    expect(tables.length).toBeGreaterThan(0);
    const wrapper = tables[0].parentElement as HTMLElement;
    // The previous code used `overflow: hidden`, which silently hid the
    // overflow instead of giving the admin a way to scroll. A scrollable
    // wrapper is the lesser evil.
    expect(wrapper.style.overflow).toBe('auto');
  });

  it('renders the product row at desktop', async () => {
    hoisted.isMobile = false;
    render(<AdminProductsPage />);
    await screen.findByText('Test Mouse');
    const row = screen.getByText('Test Mouse').closest('tr');
    expect(row).toBeInTheDocument();
    expect(row?.textContent).toContain('M-1');
    expect(row?.textContent).toContain('Electronics');
  });
});

describe('AdminProductsPage - modal', () => {
  it('opens the modal in 600px-wide form on desktop', async () => {
    hoisted.isMobile = false;
    render(<AdminProductsPage />);
    const addButton = await screen.findByText('+ Add Product');
    fireEvent.click(addButton);

    const modal = await screen.findByTestId('product-modal');
    expect(modal.style.width).toBe('600px');
  });

  it('makes the modal full-width on mobile and stacks the form rows', async () => {
    hoisted.isMobile = true;
    render(<AdminProductsPage />);
    const addButton = await screen.findByText('+ Add Product');
    fireEvent.click(addButton);

    const modal = await screen.findByTestId('product-modal');
    // The hard-coded 600px would clip the right edge on a 360px phone;
    // we now go near-full-width with a small horizontal margin.
    expect(modal.style.width).toMatch(/calc\(100vw - 24px\)/);

    // The Name input is in the first grid row. Walk the DOM: the
    // input is inside a field wrapper which is inside the grid row.
    const nameInput = modal.querySelector('input[type="text"]') as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();
    // grid row = input > field div > grid row
    const gridRow = nameInput.parentElement?.parentElement as HTMLElement;
    expect(gridRow).toBeTruthy();
    // The wrapper grid uses a 1-column template on mobile.
    expect(gridRow.style.gridTemplateColumns).toBe('1fr');
  });

  it('the price/compare/quantity row collapses to one column on mobile', async () => {
    hoisted.isMobile = true;
    render(<AdminProductsPage />);
    const addButton = await screen.findByText('+ Add Product');
    fireEvent.click(addButton);

    // The Price input is type=number, step=0.01, required, with empty
    // value (fresh form). Find it and walk up to its grid row.
    const priceInput = document.querySelector(
      'input[type="number"][step="0.01"][required]',
    ) as HTMLInputElement;
    expect(priceInput).toBeInTheDocument();
    // The grid wrapper is two levels up: input > field div > grid row.
    const gridRow = priceInput.parentElement?.parentElement as HTMLElement;
    expect(gridRow.style.gridTemplateColumns).toBe('1fr');
  });
});
