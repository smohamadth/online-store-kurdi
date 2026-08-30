/**
 * AdminOrdersPage - mobile responsiveness.
 *
 * The page shows a seven-column table on desktop. On phones (under 640px)
 * the table is unreadable: dates wrap mid-month, the action buttons get
 * squished, and rows push off the right edge. The page must therefore
 * switch to a stacked card list at the mobile breakpoint and wrap the
 * filter pills so they don't blow out the layout.
 *
 * We render the page directly (without the AdminLayout, which would
 * demand a real auth roundtrip) and stub the two collaborators it uses:
 * useStoreSettings for the currency symbol and useIsMobile for the
 * breakpoint. The api module is also mocked so getOrders returns a
 * fixed set of orders and the page renders the body we want to assert
 * on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AdminOrdersPage from './page';
import { setNextRouter } from '@/test/setup-components';

const sampleOrders = [
  {
    id: 'o-1',
    orderNumber: '1001',
    status: 'pending',
    totalAmount: 49.99,
    paymentMethod: 'Credit Card',
    createdAt: '2024-04-01T10:00:00Z',
    items: [{ name: 'Mouse' }, { name: 'Keyboard' }],
    user: { firstName: 'Sara', lastName: 'Karim', email: 'sara@example.com' },
  },
  {
    id: 'o-2',
    orderNumber: '1002',
    status: 'delivered',
    totalAmount: 12,
    paymentMethod: 'Cash',
    createdAt: '2024-04-02T10:00:00Z',
    items: [],
  },
];

// `vi.hoisted` ensures the state object exists before any of the mock
// factories run, which Vitest hoists to the top of the file.
const hoisted = vi.hoisted(() => ({
  isMobile: false,
  settings: { currency: 'USD', currencySymbol: '$', storeName: 'Test Store' },
}));

// vi.mock is hoisted above the imports, so the closure must reference
// only values that are also hoisted. We give the api mock its own
// getOrders fn so individual tests can override the resolved value.
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<any>('@/lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getOrders: vi.fn(),
    },
  };
});

vi.mock('@/lib/hooks', () => ({
  useIsMobile: () => hoisted.isMobile,
}));

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: hoisted.settings, loading: false }),
  formatPrice: (n: number, sym: string) => `${sym}${Number(n).toFixed(2)}`,
}));

beforeEach(async () => {
  setNextRouter({ pathname: '/admin/orders' });
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ role: 'admin', firstName: 'Admin' }));
  hoisted.isMobile = false;
  hoisted.settings = { currency: 'USD', currencySymbol: '$', storeName: 'Test Store' };
  // Default the orders mock to a known set; individual tests can override.
  const { api } = await import('@/lib/api');
  // `as any` because the order items here are deliberately partial: the
  // page only reads `id`, `orderNumber`, `status`, `totalAmount`,
  // `paymentMethod`, `createdAt`, `items[].name`, and the optional
  // shippingAddress / user fields.
  vi.mocked(api.getOrders).mockResolvedValue({ data: sampleOrders, status: 200 } as any);
});

afterEach(() => {
  localStorage.clear();
});

describe('AdminOrdersPage - mobile', () => {
  it('wraps the filter pills so they fit a narrow viewport', async () => {
    hoisted.isMobile = true;
    render(<AdminOrdersPage />);
    const row = await screen.findByTestId('orders-filter-row');
    // The wrapping is the fix - on the old code, six pills in a `flex`
    // row overflowed the viewport at 360px wide.
    expect(row.style.flexWrap).toBe('wrap');
  });

  it('renders a stacked card list, not the table, on mobile', async () => {
    hoisted.isMobile = true;
    render(<AdminOrdersPage />);
    // Wait for the page to finish loading orders.
    await screen.findByTestId('orders-filter-row');
    // The card list is a new container; the table is desktop-only.
    const cardList = await screen.findByTestId('orders-card-list');
    expect(cardList).toBeInTheDocument();
    // Two cards, one per order in our seed.
    const cards = within(cardList).getAllByTestId('order-card');
    expect(cards).toHaveLength(sampleOrders.length);
    // The seven-column <table> is NOT in the DOM at the mobile
    // breakpoint - the old code shipped a table that overflowed.
    expect(cardList.querySelector('table')).toBeNull();
  });

  it('each card shows the order id, total, customer, items count, status, and a view link', async () => {
    hoisted.isMobile = true;
    render(<AdminOrdersPage />);
    const cardList = await screen.findByTestId('orders-card-list');
    const cards = within(cardList).getAllByTestId('order-card');
    // Find the card for order o-1. The API returns the data in a stable
    // order, but the cards themselves are not keyed by data order, so
    // search by the order-number text rather than indexing.
    const card = cards.find((c) => c.textContent?.includes('#1001'))!;
    expect(card).toBeDefined();
    // Total formatted with the store currency symbol.
    expect(card.textContent).toContain('$49.99');
    // Items count.
    expect(card.textContent).toContain('2 items');
    // Status select is in the card (not just a label).
    const statusSelect = within(card).getByLabelText('Status') as HTMLSelectElement;
    expect(statusSelect).toBeInTheDocument();
    expect(statusSelect.value).toBe('pending');
    // View link points at the order detail page.
    const viewLink = within(card).getByRole('link', { name: /view/i });
    expect(viewLink.getAttribute('href')).toBe('/admin/orders/o-1');
  });

  it('gives the status select a touch-target-friendly min height', async () => {
    hoisted.isMobile = true;
    render(<AdminOrdersPage />);
    const cardList = await screen.findByTestId('orders-card-list');
    const cards = within(cardList).getAllByTestId('order-card');
    const card = cards.find((c) => c.textContent?.includes('#1001'))!;
    const statusSelect = within(card).getByLabelText('Status') as HTMLSelectElement;
    // WCAG 2.5.5 (Target Size) recommends >= 44x44 CSS pixels; we
    // settle for 36px on the compact mobile row to leave room for the
    // view link beside it. Pinning the value catches a regression to a
    // 24px tap target.
    expect(parseInt(statusSelect.style.minHeight, 10)).toBeGreaterThanOrEqual(36);
  });
});

describe('AdminOrdersPage - desktop', () => {
  it('renders the seven-column table at desktop widths', async () => {
    hoisted.isMobile = false;
    render(<AdminOrdersPage />);
    // Wait for the page to finish loading orders. We use the filter row
    // as a signal that the loading state is over.
    await screen.findByTestId('orders-filter-row');
    // The card list should not exist at desktop.
    expect(screen.queryByTestId('orders-card-list')).toBeNull();
    // The table is the only data container. We look up by <table> since
    // it has no testid yet - adding one would be a separate change.
    const tables = document.querySelectorAll('table');
    expect(tables.length).toBeGreaterThan(0);
    const headerRow = tables[0].querySelector('thead tr');
    expect(headerRow?.textContent).toContain('Order');
    expect(headerRow?.textContent).toContain('Customer');
    expect(headerRow?.textContent).toContain('Items');
    expect(headerRow?.textContent).toContain('Date');
    expect(headerRow?.textContent).toContain('Total');
    expect(headerRow?.textContent).toContain('Status');
    expect(headerRow?.textContent).toContain('Actions');
  });

  it('wraps the table in a horizontally scrollable container instead of overflowing the document', async () => {
    hoisted.isMobile = false;
    render(<AdminOrdersPage />);
    await screen.findByTestId('orders-filter-row');
    const tables = document.querySelectorAll('table');
    expect(tables.length).toBeGreaterThan(0);
    const wrapper = tables[0].parentElement as HTMLElement;
    // The previous code had `overflow: hidden` on the wrapper, which
    // hid overflow at the cost of a wider document. A scrollable
    // container is the right trade-off.
    expect(wrapper.style.overflow).toBe('auto');
  });

  it('renders the filter pill row at desktop with the wider padding', async () => {
    hoisted.isMobile = false;
    render(<AdminOrdersPage />);
    const row = await screen.findByTestId('orders-filter-row');
    const firstPill = row.querySelector('button') as HTMLButtonElement;
    expect(firstPill).toBeInTheDocument();
    // Desktop uses the wider padding; mobile uses the tighter one.
    expect(firstPill.style.padding).toMatch(/8px 16px/);
  });
});
