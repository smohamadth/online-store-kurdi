'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { API_BASE } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <p style={{ color: '#666' }}>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div>
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
          <p style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>↑ 12% from last month</p>
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Orders</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{analytics.totalOrders}</p>
          <p style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>↑ 8% from last month</p>
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Average Order Value</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatPrice(analytics.averageOrderValue, settings.currencySymbol)}</p>
          <p style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>↑ 5% from last month</p>
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

      {/* Revenue Chart Placeholder */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        padding: '24px',
        marginBottom: '32px',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>Revenue Overview</h3>
        <div style={{
          height: '300px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          padding: '0 16px',
        }}>
          {[65, 40, 85, 50, 70, 45, 90, 60, 75, 55, 80, 95].map((height, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '100%',
                height: `${height}%`,
                backgroundColor: i === 11 ? '#3b82f6' : '#e5e5e5',
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.3s',
              }} />
              <span style={{ fontSize: '10px', color: '#666' }}>
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}
              </span>
            </div>
          ))}
        </div>
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