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
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

function mockActivityEndpoints(opts: { realtime?: any; search?: any; trending?: any; failActivity?: boolean } = {}) {
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
    expect(screen.getByText(/ANALYTICS_TRACKING_ENABLED/)).toBeInTheDocument();
  });
});
