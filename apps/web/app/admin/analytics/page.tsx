// /admin/analytics - the analytics dashboard: KPIs with real
// period-over-period trends, a real revenue chart, the conversion funnel,
// real-time stats, search analytics, trending products, and PDF/CSV export.
//
// Every figure here is computed from the database by /api/reports/sales or
// /api/analytics/*. Three things on this page used to be fabricated and are
// now gone:
//   - the KPI trend captions were the literal strings "↑ 12% from last
//     month", "↑ 8%" and "↑ 5%", so a store whose revenue had halved still
//     displayed growth;
//   - the "Revenue Overview" chart was a hardcoded array of twelve numbers
//     against Jan-Dec labels, connected to nothing;
//   - there was no way to pick a period, so everything was silently 30 days.
// Invented numbers in an admin panel are worse than no numbers, because they
// get trusted and acted on.
'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { API_BASE } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

/**
 * A period-over-period trend caption.
 *
 * `percent: null` means the previous period had no data. There is no
 * meaningful percentage for "grew from zero", so say so rather than print
 * an infinity or a fabricated figure.
 */
function DeltaCaption({ delta }: { delta?: { percent: number | null; direction: string } | null }) {
  if (!delta) {
    return <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>&nbsp;</p>;
  }
  if (delta.percent === null) {
    return (
      <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
        No prior period to compare
      </p>
    );
  }
  const colour = delta.direction === 'up' ? '#22c55e'
    : delta.direction === 'down' ? '#ef4444' : '#666';
  const arrow = delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→';
  return (
    <p style={{ fontSize: '12px', color: colour, marginTop: '4px' }}>
      {arrow} {Math.abs(delta.percent)}% vs previous period
    </p>
  );
}

export default function AdminAnalyticsPage() {
  const { settings } = useStoreSettings();
  // The 1fr/1fr grid for "Orders by Status" + "Top Products" splits a
  // narrow viewport in half, leaving each card with a column narrower
  // than a phone screen. Stack them under 640px.
  const isMobile = useIsMobile(640);
  const [analytics, setAnalytics] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    topProducts: [] as any[],
    recentOrders: [] as any[],
    ordersByStatus: {} as Record<string, number>,
  });
  // The selected reporting window. Drives the report fetch AND the export
  // links, so a downloaded PDF always covers the period on screen.
  const [days, setDays] = useState(30);
  // Real report: totals, period-over-period deltas and the revenue series.
  const [report, setReport] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Behavioural analytics (the event loop: view / search / add_to_cart /
  // purchase). Only populated when the store runs the API with
  // ANALYTICS_TRACKING_ENABLED=true - off by default, and the
  // /privacy page documents that.
  const [activity, setActivity] = useState({
    today: null as null | { views: number; searches: number; addToCarts: number; purchases: number },
    topSearches: [] as { query: string; count: number }[],
    trending: [] as any[],
    loaded: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    fetchActivity();
  }, []);

  // Re-fetch whenever the admin changes the period.
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('token');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_BASE}/reports/sales?days=${days}`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${API_BASE}/analytics/funnel?days=${days}`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([salesRes, funnelRes]) => {
      if (cancelled) return;
      setReport(salesRes?.data ?? null);
      setFunnel(funnelRes?.data ?? null);
    });

    return () => { cancelled = true; };
  }, [days]);

  const fetchActivity = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [realtime, search, trending] = await Promise.all([
        fetch(`${API_BASE}/analytics/realtime`, { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/analytics/search?days=30`, { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/analytics/trending?limit=5`).then((r) => (r.ok ? r.json() : null)),
      ]);
      setActivity({
        today: realtime?.data?.metrics || null,
        topSearches: (search?.data || []).slice(0, 5),
        trending: trending?.data || [],
        loaded: true,
      });
    } catch (err) {
      console.error('Failed to fetch activity:', err);
      setActivity((a) => ({ ...a, loaded: true }));
    }
  };

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Real figures from the database. This page used to fabricate per-product
      // "revenue" and "sold" counts with Math.random(), so the numbers changed
      // on every refresh and never matched actual sales.
      const res = await fetch(`${API_BASE}/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const { data } = await res.json();

      setAnalytics({
        totalProducts: data.totalProducts || 0,
        totalOrders: data.totalOrders || 0,
        totalRevenue: data.totalRevenue || 0,
        averageOrderValue: data.averageOrderValue || 0,
        topProducts: data.topProducts || [],
        recentOrders: data.recentOrders || [],
        ordersByStatus: data.ordersByStatus || {},
      });
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Download an export over fetch, then hand the browser a blob URL.
   *
   * These endpoints are admin-only, so the request must carry the bearer
   * token. A plain <a href> cannot set an Authorization header, and putting
   * the JWT in the query string would leak it into server access logs,
   * browser history and Referer headers. Fetching with the header and
   * saving the resulting blob keeps the token out of the URL entirely.
   */
  const downloadReport = async (ext: 'pdf' | 'csv') => {
    setExportError(null);
    setDownloading(ext);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/reports/sales.${ext}?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-report-${days}d.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Release the object URL, otherwise the blob is pinned in memory for
      // the lifetime of the document.
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err?.message || 'Export failed');
    } finally {
      setDownloading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered': return '#22c55e';
      case 'processing': return '#f59e0b';
      case 'shipped': return '#3b82f6';
      case 'cancelled': return '#ef4444';
      case 'pending': return '#6b7280';
      default: return '#666';
    }
  };

  const series: any[] = report?.series ?? [];
  // Scale bars against the tallest bucket. Computed here (not inline) so the
  // all-zero case is handled once: dividing by a zero max yields NaN% heights
  // and collapses the chart.
  const maxBucket = series.reduce((m, b) => Math.max(m, Number(b?.revenue) || 0), 0);


  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <p style={{ color: '#666' }}>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar: reporting period + exports. There was previously no way to
          change the period at all - every figure was silently the last 30
          days - and no way to get the numbers out of the browser. */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label htmlFor="report-period" style={{ fontSize: '14px', color: '#666' }}>Period</label>
          <select
            id="report-period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
              fontSize: '14px',
              backgroundColor: 'white',
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {exportError && (
            <span role="alert" style={{ fontSize: '13px', color: '#ef4444' }}>{exportError}</span>
          )}
          <button
            type="button"
            onClick={() => downloadReport('pdf')}
            disabled={downloading !== null}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
              fontSize: '14px',
              fontWeight: 600,
              backgroundColor: '#111',
              color: 'white',
              cursor: downloading ? 'wait' : 'pointer',
            }}
          >
            {downloading === 'pdf' ? 'Preparing…' : 'Download PDF report'}
          </button>
          <button
            type="button"
            onClick={() => downloadReport('csv')}
            disabled={downloading !== null}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
              fontSize: '14px',
              fontWeight: 600,
              backgroundColor: 'white',
              color: '#111',
              cursor: downloading ? 'wait' : 'pointer',
            }}
          >
            {downloading === 'csv' ? 'Preparing…' : 'Export CSV'}
          </button>
        </div>
      </div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Revenue</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatPrice(analytics.totalRevenue, settings.currencySymbol)}</p>
          <DeltaCaption delta={report?.deltas?.revenue} />
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Orders</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{analytics.totalOrders}</p>
          <DeltaCaption delta={report?.deltas?.orders} />
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Average Order Value</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatPrice(analytics.averageOrderValue, settings.currencySymbol)}</p>
          <DeltaCaption delta={report?.deltas?.averageOrderValue} />
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Products</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{analytics.totalProducts}</p>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Active in catalog</p>
        </div>
      </div>

      {/* Store Activity - behavioural data from the analytics event loop */}
      {activity.loaded && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          {/* Today */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>Today</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                ['Product views', activity.today?.views ?? 0],
                ['Searches', activity.today?.searches ?? 0],
                ['Add to cart', activity.today?.addToCarts ?? 0],
                ['Purchases', activity.today?.purchases ?? 0],
              ].map(([label, count]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#666' }}>{label}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>{count as number}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top searches (30 days) */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>Top Searches (30d)</h3>
            {activity.topSearches.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#999' }}>
                No searches recorded. Behavioural data is only collected when the API runs with
                <code style={{ margin: '0 4px' }}>ANALYTICS_TRACKING_ENABLED=true</code>.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activity.topSearches.map((s) => (
                  <div key={s.query} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px' }}>{s.query}</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#666' }}>{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trending products (7 days of views) */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>Trending (7d views)</h3>
            {activity.trending.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#999' }}>No product views recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activity.trending.map((p: any, i: number) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#999', width: '16px' }}>{i + 1}.</span>
                    <span style={{ fontSize: '14px', flex: 1 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
        {/* Orders by Status */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
          padding: '24px',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>Orders by Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {Object.entries(analytics.ordersByStatus).map(([status, count]) => (
              <div key={status}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{status}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
                <div style={{
                  height: '8px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(count / analytics.totalOrders) * 100}%`,
                    backgroundColor: getStatusColor(status),
                    borderRadius: '4px',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
          padding: '24px',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>Top Products by Revenue</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {analytics.topProducts.map((product: any, index: number) => (
              <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: index < 3 ? '#fef3c7' : '#f5f5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: index < 3 ? '#f59e0b' : '#666',
                }}>
                  {index + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500, fontSize: '14px' }}>{product.name}</p>
                  <p style={{ fontSize: '12px', color: '#666' }}>{product.sold} sold</p>
                </div>
                <span style={{ fontWeight: 600 }}>{formatPrice(product.revenue || 0, settings.currencySymbol)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue over time - real buckets from /api/reports/sales.
          This card used to render a hardcoded [65,40,85,...] array against
          fixed Jan-Dec labels: a picture of nothing. */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        padding: '24px',
        marginBottom: '32px',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>
          Revenue Overview{report?.range ? ` (by ${report.range.granularity})` : ''}
        </h3>
        {!report ? (
          <p style={{ fontSize: '13px', color: '#999' }}>Loading revenue…</p>
        ) : maxBucket <= 0 ? (
          <p style={{ fontSize: '13px', color: '#999' }}>
            No revenue in this period. Cancelled and refunded orders are excluded.
          </p>
        ) : (
          <div style={{
            height: '300px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: series.length > 40 ? '1px' : '8px',
            padding: '0 16px',
          }}>
            {series.map((b: any, i: number) => (
              <div
                key={b.date}
                title={`${b.label}: ${formatPrice(b.revenue, settings.currencySymbol)} from ${b.orders} order(s)`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: 0 }}
              >
                <div style={{
                  width: '100%',
                  // Percentage of the tallest bar. Guarded against the
                  // all-zero case upstream, which would divide by zero.
                  height: `${Math.max(1, (b.revenue / maxBucket) * 100)}%`,
                  backgroundColor: b.revenue > 0 ? '#3b82f6' : '#e5e5e5',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s',
                }} />
                {(series.length <= 14 || i % Math.ceil(series.length / 12) === 0) && (
                  <span style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>{b.label}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conversion funnel. The API has served this since the funnel work
          landed, but nothing in the admin UI ever called it, so the data was
          unreachable for the merchant it was built for. */}
      <div data-testid="funnel-card" style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        padding: '24px',
        marginBottom: '32px',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Conversion Funnel</h3>
        {!funnel || !funnel.stages?.some((s: any) => s.count > 0) ? (
          <p style={{ fontSize: '13px', color: '#999' }}>
            No funnel data yet. Behavioural events are only collected when the API runs with
            <code style={{ margin: '0 4px' }}>ANALYTICS_TRACKING_ENABLED=true</code>.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
              {funnel.stages.map((stage: any) => (
                <div key={stage.step}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '14px', textTransform: 'capitalize' }}>
                      {String(stage.step).replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {stage.count}
                      <span style={{ color: '#666', fontWeight: 400, marginLeft: '8px' }}>
                        {Math.round((stage.conversionFromStart ?? 0) * 100)}%
                      </span>
                    </span>
                  </div>
                  <div style={{ height: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round((stage.conversionFromStart ?? 0) * 100)}%`,
                      backgroundColor: '#3b82f6',
                      borderRadius: '5px',
                    }} />
                  </div>
                </div>
              ))}
            </div>
            {funnel.biggestDropOff && (
              <p style={{ fontSize: '13px', color: '#92400e', marginTop: '16px' }}>
                Biggest drop-off before <strong>{String(funnel.biggestDropOff.step).replace(/_/g, ' ')}</strong>
                {' '}— {funnel.biggestDropOff.droppedFromPrevious} lost from the previous step.
              </p>
            )}
          </>
        )}
      </div>

      {/* Recent Orders */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        // `overflow: auto` (was 'hidden'): four columns don't fit a 360px
        // phone; allow horizontal scroll inside the card instead of
        // overflowing the document.
        overflow: 'auto',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e5e5' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Recent Orders</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Order</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Customer</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Amount</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {analytics.recentOrders.map((order: any) => (
              <tr key={order.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>#{order.orderNumber || order.id}</td>
                <td style={{ padding: '12px 16px', color: '#666' }}>
                  {order.user?.firstName || 'Guest'} {order.user?.lastName || ''}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                  {formatPrice(order.totalAmount || 0, settings.currencySymbol)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '50px',
                    fontSize: '12px',
                    backgroundColor: `${getStatusColor(order.status)}20`,
                    color: getStatusColor(order.status),
                    textTransform: 'capitalize',
                  }}>
                    {order.status || 'pending'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}