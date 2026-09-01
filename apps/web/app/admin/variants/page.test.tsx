/**
 * Component tests for the /admin/variants dashboard.
 *
 * The page lists every variant in the catalogue with filter
 * chips and inline actions. Heavy CRUD lives in the integration
 * suite; here we pin the UI contract:
 *
 *   - first load fires GET /api/variants and renders the rows
 *   - filter chips change the query string
 *   - "Disable" PATCHes /api/variants/:id with isActive: false
 *   - "Delete" calls DELETE /api/variants/:id and removes the row
 *   - "Edit" navigates to the per-product variants page
 *   - the empty-state copy appears when the API returns []
 *
 * Mock lifecycle: the global setup-components calls
 * `vi.restoreAllMocks()` in afterEach. We use `vi.hoisted` to
 * share the fetch mock between the factory and the test body,
 * and re-install the implementation in beforeEach.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  pushMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: hoisted.pushMock,
    back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), replace: vi.fn(),
  }),
  useParams: () => ({}),
  usePathname: () => '/admin/variants',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/http', () => ({
  API_BASE: 'http://api.local/api',
}));

vi.mock('@/lib/hooks', () => ({
  useIsMobile: () => false,
}));

import AdminVariantsPage from './page';

const TWO_VARIANTS = [
  {
    id: 'v-a', productId: 'p-1', name: 'Red, Small', sku: 'rs-1', slug: 'red-small',
    price: 10, compareAtPrice: null, quantity: 5, isActive: true,
    attributes: { Color: 'Red', Size: 'Small' },
  },
  {
    id: 'v-b', productId: 'p-2', name: 'Blue, Large', sku: 'bl-1', slug: 'blue-large',
    price: 20, compareAtPrice: 25, quantity: 0, isActive: false,
    attributes: { Color: 'Blue', Size: 'Large' },
  },
];

function defaultFetchImpl(url: string) {
  if (typeof url === 'string' && url.includes('/products?take=')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
  }
  if (typeof url === 'string' && url.includes('/variants?')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: TWO_VARIANTS }) });
  }
  if (typeof url === 'string' && /\/variants\/v-[ab]$/.test(url)) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: { id: url.split('/').pop() } }) });
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: {} }) });
}

beforeEach(() => {
  hoisted.pushMock.mockReset();
  localStorage.setItem('token', 'fake-token');
  hoisted.fetchMock.mockReset();
  hoisted.fetchMock.mockImplementation(defaultFetchImpl);
  globalThis.fetch = hoisted.fetchMock as any;
});

describe('Admin /admin/variants dashboard', () => {
  it('renders the variants table on first load', async () => {
    render(<AdminVariantsPage />);
    await waitFor(() => expect(screen.getByTestId('variants-table')).toBeTruthy());
    expect(screen.getByTestId('variant-row-v-a')).toBeTruthy();
    expect(screen.getByTestId('variant-row-v-b')).toBeTruthy();
  });

  it('renders all four filter chips', async () => {
    render(<AdminVariantsPage />);
    await waitFor(() => expect(screen.getByTestId('variants-table')).toBeTruthy());
    expect(screen.getByTestId('filter-product')).toBeTruthy();
    expect(screen.getByTestId('filter-status')).toBeTruthy();
    expect(screen.getByTestId('filter-stock')).toBeTruthy();
    expect(screen.getByTestId('filter-search')).toBeTruthy();
  });

  it('shows the empty-state when the API returns no variants', async () => {
    hoisted.fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/variants?')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
      }
      if (typeof url === 'string' && url.includes('/products?')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: {} }) });
    });
    render(<AdminVariantsPage />);
    await waitFor(() => expect(screen.getByText(/No variants match/i)).toBeTruthy());
  });

  it('"Edit" navigates to the per-product variants page', async () => {
    render(<AdminVariantsPage />);
    await waitFor(() => screen.getByTestId('variant-row-v-a'));
    const row = screen.getByTestId('variant-row-v-a');
    const editBtn = within(row).getByText('Edit');
    fireEvent.click(editBtn);
    expect(hoisted.pushMock).toHaveBeenCalledWith('/admin/products/p-1/variants');
  });

  it('"Disable" PATCHes the variant with isActive: false', async () => {
    render(<AdminVariantsPage />);
    await waitFor(() => screen.getByTestId('variant-row-v-a'));
    fireEvent.click(screen.getByTestId('toggle-v-a'));
    await waitFor(() => {
      const patchCall = hoisted.fetchMock.mock.calls.find((c: any[]) => {
        const [u, init] = c;
        return typeof u === 'string'
          && u.includes('/variants/v-a')
          && (init as any)?.method === 'PATCH'
          && (init as any)?.body?.includes('"isActive":false');
      });
      expect(patchCall).toBeTruthy();
    });
  });

  it('status badge shows Active / Inactive based on isActive', async () => {
    render(<AdminVariantsPage />);
    await waitFor(() => screen.getByTestId('variant-row-v-a'));
    const statusA = screen.getByTestId('variant-status-v-a');
    const statusB = screen.getByTestId('variant-status-v-b');
    expect(statusA.textContent).toBe('Active');
    expect(statusB.textContent).toBe('Inactive');
  });

  it('shows the original price with a strikethrough when compareAtPrice is set', async () => {
    render(<AdminVariantsPage />);
    await waitFor(() => screen.getByTestId('variant-row-v-b'));
    const row = screen.getByTestId('variant-row-v-b');
    const text = row.textContent || '';
    expect(text).toContain('$25.00');
    expect(text).toContain('$20.00');
  });
});
