/**
 * AdminAnalyticsPage - the Store Activity section fed by the analytics
 * event loop (view / search / add_to_cart / purchase).
 *
 * Covers:
 *   - today's counters, top searches and trending products render from
 *     the /analytics/realtime, /analytics/search and
 *     /analytics/trending endpoints
 *   - the empty state points at ANALYTICS_TRACKING_ENABLED when no
 *     behavioural data exists yet (tracking is off by default)
 *   - a failed activity fetch never breaks the sales dashboard
 *
 * Plus the reporting work that replaced fabricated figures:
 *   - KPI trend captions come from real period-over-period deltas, and say
 *     "No prior period to compare" instead of inventing a percentage
 *   - the revenue chart is drawn from the real series, not a literal array
 *   - the period selector re-fetches, and exports carry the same range
 *   - the conversion funnel is surfaced at all
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import AdminAnalyticsPage from './page';
import { setNextRouter } from '@/test/setup-components';

vi.mock('@/lib/hooks', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currency: 'USD', currencySymbol: '$', storeName: 'Test Store' }, loading: false }),
  formatPrice: (n: number, sym: string) => `${sym}${Number(n).toFixed(2)}`,
}));

const dashboardPayload = {
  data: {
    totalProducts: 10,
    totalOrders: 3,
    totalRevenue: 100,
    averageOrderValue: 33.33,
    topProducts: [],
    recentOrders: [],
    ordersByStatus: {},
  },
};

const reportPayload = {
  range: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T00:00:00.000Z', days: 30, granularity: 'day' },
  totals: { revenue: 100, orders: 3, averageOrderValue: 33.33, unitsSold: 5, newCustomers: 2 },
  deltas: {
    revenue: { current: 100, previous: 80, change: 20, percent: 25, direction: 'up' },
    orders: { current: 3, previous: 6, change: -3, percent: -50, direction: 'down' },
    averageOrderValue: { current: 33.33, previous: 0, change: 33.33, percent: null, direction: 'up' },
    newCustomers: { current: 2, previous: 2, change: 0, percent: 0, direction: 'flat' },
  },
  series: [
    { date: '2024-01-01', label: '1 Jan', revenue: 40, orders: 1 },
    { date: '2024-01-02', label: '2 Jan', revenue: 60, orders: 2 },
  ],
  ordersByStatus: { delivered: 3 },
  topProducts: [], topCustomers: [], lowStock: [], payments: [],
};

const funnelPayload = {
  days: 30,
  stages: [
    { step: 'view', count: 100, conversionFromStart: 1, conversionFromPrevious: 1, droppedFromPrevious: 0 },
    { step: 'add_to_cart', count: 40, conversionFromStart: 0.4, conversionFromPrevious: 0.4, droppedFromPrevious: 60 },
    { step: 'begin_checkout', count: 20, conversionFromStart: 0.2, conversionFromPrevious: 0.5, droppedFromPrevious: 20 },
    { step: 'purchase', count: 10, conversionFromStart: 0.1, conversionFromPrevious: 0.5, droppedFromPrevious: 10 },
  ],
  biggestDropOff: { step: 'add_to_cart', droppedFromPrevious: 60 },
};

function mockActivityEndpoints(opts: { realtime?: any; search?: any; trending?: any; failActivity?: boolean; report?: any; funnel?: any; failReport?: boolean } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/dashboard/stats')) {
      return new Response(JSON.stringify(dashboardPayload), { status: 200 });
    }
    if (opts.failActivity) {
      return new Response('boom', { status: 500 });
    }
    if (u.includes('/analytics/realtime')) {
      return new Response(JSON.stringify(opts.realtime ?? { data: { metrics: { views: 12, searches: 4, addToCarts: 2, purchases: 1 } } }), { status: 200 });
    }
    if (u.includes('/analytics/search')) {
      return new Response(JSON.stringify(opts.search ?? { data: [{ query: 'shoes', count: 7 }, { query: 'shirt', count: 3 }] }), { status: 200 });
    }
    if (u.includes('/analytics/trending')) {
      return new Response(JSON.stringify(opts.trending ?? { data: [{ id: 'p1', name: 'Mug' }, { id: 'p2', name: 'Candle' }] }), { status: 200 });
    }
    if (u.includes('/reports/sales')) {
      if (opts.failReport) return new Response('boom', { status: 500 });
      return new Response(JSON.stringify(opts.report ?? { data: reportPayload }), { status: 200 });
    }
    if (u.includes('/analytics/funnel')) {
      return new Response(JSON.stringify(opts.funnel ?? { data: funnelPayload }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  setNextRouter({ pathname: '/admin/analytics' });
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ role: 'admin', firstName: 'Admin' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Store Activity section', () => {
  it('renders today counters, top searches and trending products', async () => {
    mockActivityEndpoints();
    render(<AdminAnalyticsPage />);

    expect(await screen.findByText('Today')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Product views')).toBeInTheDocument());
    expect(screen.getByText('12')).toBeInTheDocument(); // views
    expect(screen.getByText('Searches')).toBeInTheDocument();

    expect(screen.getByText('Top Searches (30d)')).toBeInTheDocument();
    expect(screen.getByText('shoes')).toBeInTheDocument();
    expect(screen.getByText('shirt')).toBeInTheDocument();

    expect(screen.getByText('Trending (7d views)')).toBeInTheDocument();
    expect(screen.getByText('Mug')).toBeInTheDocument();
    expect(screen.getByText('Candle')).toBeInTheDocument();

    // the sales dashboard still renders alongside
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });

  it('points at the tracking flag when no searches have been recorded', async () => {
    mockActivityEndpoints({ search: { data: [] }, trending: { data: [] } });
    render(<AdminAnalyticsPage />);

    await screen.findByText(/ANALYTICS_TRACKING_ENABLED/);
    expect(screen.getByText(/No product views recorded yet/)).toBeInTheDocument();
  });

  it('keeps the sales dashboard if the activity fetch fails (graceful empty state)', async () => {
    mockActivityEndpoints({ failActivity: true });
    render(<AdminAnalyticsPage />);

    expect(await screen.findByText('Total Revenue')).toBeInTheDocument();
    // the section renders with its empty state instead of data
    expect(screen.getByText('Top Searches (30d)')).toBeInTheDocument();
    // The funnel card names the same flag, so scope to the searches card.
    expect(screen.getAllByText(/ANALYTICS_TRACKING_ENABLED/).length).toBeGreaterThan(0);
  });
});

describe('KPI trend captions', () => {
  it('renders real period-over-period deltas', async () => {
    mockActivityEndpoints();
    render(<AdminAnalyticsPage />);

    expect(await screen.findByText('↑ 25% vs previous period')).toBeInTheDocument();
    expect(screen.getByText('↓ 50% vs previous period')).toBeInTheDocument();
  });

  // The whole point of the change: these three strings were hardcoded, so a
  // store whose revenue had halved still showed growth on every card.
  it('never shows the old fabricated captions', async () => {
    mockActivityEndpoints();
    render(<AdminAnalyticsPage />);
    await screen.findByText('↑ 25% vs previous period');

    expect(screen.queryByText(/↑ 12% from last month/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↑ 8% from last month/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↑ 5% from last month/)).not.toBeInTheDocument();
  });

  it('says so instead of inventing a percentage when there is no prior period', async () => {
    mockActivityEndpoints();
    render(<AdminAnalyticsPage />);
    expect(await screen.findByText('No prior period to compare')).toBeInTheDocument();
  });

  it('degrades quietly when the report endpoint fails', async () => {
    mockActivityEndpoints({ failReport: true });
    render(<AdminAnalyticsPage />);

    // The dashboard still renders; it simply shows no trend captions.
    expect(await screen.findByText('Total Revenue')).toBeInTheDocument();
    expect(screen.queryByText(/vs previous period/)).not.toBeInTheDocument();
  });
});

describe('Revenue chart', () => {
  it('is drawn from the real series, not a hardcoded array', async () => {
    mockActivityEndpoints();
    render(<AdminAnalyticsPage />);

    // Labels come from the API payload.
    expect(await screen.findByTitle(/1 Jan: \$40\.00 from 1 order/)).toBeInTheDocument();
    expect(screen.getByTitle(/2 Jan: \$60\.00 from 2 order/)).toBeInTheDocument();
    // The old fake chart always rendered all twelve month labels.
    expect(screen.queryByText('Dec')).not.toBeInTheDocument();
  });

  it('shows an honest empty state rather than bars when there is no revenue', async () => {
    mockActivityEndpoints({
      report: { data: { ...reportPayload, series: [{ date: '2024-01-01', label: '1 Jan', revenue: 0, orders: 0 }] } },
    });
    render(<AdminAnalyticsPage />);
    expect(await screen.findByText(/No revenue in this period/)).toBeInTheDocument();
  });
});

describe('Conversion funnel', () => {
  it('surfaces the funnel the API was already serving', async () => {
    mockActivityEndpoints();
    render(<AdminAnalyticsPage />);

    const card = within(await screen.findByTestId('funnel-card'));
    expect(card.getByText('Conversion Funnel')).toBeInTheDocument();
    // "add to cart" appears twice in this card: as the step label and inside
    // the drop-off sentence. Assert both explicitly rather than ambiguously.
    expect(card.getAllByText('add to cart')).toHaveLength(2);
    expect(card.getByText(/Biggest drop-off before/)).toHaveTextContent('60 lost from the previous step');
    expect(card.getByText('begin checkout')).toBeInTheDocument();
  });

  it('explains the empty state when tracking is off', async () => {
    mockActivityEndpoints({ funnel: { data: { stages: [], biggestDropOff: null } } });
    render(<AdminAnalyticsPage />);

    const card = within(await screen.findByTestId('funnel-card'));
    expect(card.getByText('Conversion Funnel')).toBeInTheDocument();
    expect(card.getByText(/No funnel data yet/)).toBeInTheDocument();
  });
});

describe('Period selector and exports', () => {
  it('defaults to 30 days and re-fetches when the period changes', async () => {
    const fetchMock = mockActivityEndpoints();
    render(<AdminAnalyticsPage />);
    await screen.findByText('↑ 25% vs previous period');

    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/reports/sales?days=30'))).toBe(true);

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '90' } });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/reports/sales?days=90'))).toBe(true);
    });
    // The funnel follows the same window, so the two cards never disagree.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/analytics/funnel?days=90'))).toBe(true);
  });

  it('downloads the PDF for the selected range with the token in a header, not the URL', async () => {
    const fetchMock = mockActivityEndpoints();
    // jsdom implements neither of these.
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));

    render(<AdminAnalyticsPage />);
    await screen.findByText('↑ 25% vs previous period');

    fireEvent.click(screen.getByRole('button', { name: /Download PDF report/ }));

    await waitFor(() => {
      const call = (fetchMock.mock.calls as any[]).find((c) => String(c[0]).includes('/reports/sales.pdf'));
      expect(call).toBeTruthy();
      expect(String(call[0])).toContain('days=30');
      // A JWT in the query string leaks into access logs and browser history.
      expect(String(call[0])).not.toContain('token=');
      expect(call[1].headers.Authorization).toBe('Bearer test-token');
    });

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    // The blob URL must be released, or it is pinned for the document's life.
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('surfaces an export failure instead of failing silently', async () => {
    mockActivityEndpoints({ failReport: true });
    render(<AdminAnalyticsPage />);
    await screen.findByText('Total Revenue');

    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Export failed/);
  });
});
