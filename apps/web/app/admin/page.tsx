// ---------------------------------------------------------------------------
// /admin - the admin dashboard (KPI cards, recent orders, top products).
//
// All figures come from GET /api/dashboard/stats - real aggregates
// computed in the database. (The old version summed a 100-product sample
// in the browser and hardcoded user counts; see the inline comment.)
// An API failure shows a "disconnected" banner instead of fake zeros.
// ---------------------------------------------------------------------------
'use client';

import { LoadingState } from '@/components/Spinner';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { API_BASE } from '@/lib/http';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useAdminI18n } from '@/lib/adminI18n';

export default function AdminDashboard() {
  const { settings } = useStoreSettings();
  const { t } = useAdminI18n();
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalUsers: 0,
    totalCategories: 0,
    totalRevenue: 0,
    recentOrders: [] as any[],
    topProducts: [] as any[],
    topProductsBasis: 'sales' as 'sales' | 'newest',
  });
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setApiStatus('disconnected');
        setLoading(false);
        return;
      }

      // Single source of truth: real aggregates computed in the database.
      // Previously this page pulled 100 products + the orders list and summed
      // them in the browser, hardcoded totalUsers to 2, and counted cancelled
      // orders as revenue.
      const res = await fetch(`${API_BASE}/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setApiStatus('disconnected');
        return;
      }

      const { data } = await res.json();
      let categories: any[] = [];
      try {
        const cRes = await fetch(`${API_BASE}/categories`);
        if (cRes.ok) categories = (await cRes.json()).data || [];
      } catch {}

      setStats({
        totalProducts: data.totalProducts || 0,
        totalOrders: data.totalOrders || 0,
        totalUsers: data.totalCustomers || 0,
        totalCategories: categories.length,
        totalRevenue: data.totalRevenue || 0,
        recentOrders: data.recentOrders || [],
        topProducts: data.topProducts || [],
        topProductsBasis: data.topProductsBasis === 'newest' ? 'newest' : 'sales',
      });
      setApiStatus('connected');
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setApiStatus('disconnected');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading dashboard…" minHeight={400} />;
  }

  return (
    <div>
      {/* API Status */}
      {apiStatus === 'disconnected' && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ {t('dash.apiDisconnected')}</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>{t('dash.apiHint')}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{t('dash.totalProducts')}</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalProducts}</p>
          <Link href="/admin/products" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            <DirectionArrow kind="forward" /> {t('dash.manage')}
          </Link>
        </div>

        <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{t('dash.totalOrders')}</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalOrders}</p>
          <Link href="/admin/orders" style={{ fontSize: '14px', color: '#f59e0b', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            <DirectionArrow kind="forward" /> {t('dash.manage')}
          </Link>
        </div>

        <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{t('dash.categories')}</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalCategories}</p>
          <Link href="/admin/categories" style={{ fontSize: '14px', color: '#22c55e', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            <DirectionArrow kind="forward" /> {t('dash.manage')}
          </Link>
        </div>

        <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{t('dash.totalRevenue')}</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatPrice(stats.totalRevenue, settings.currencySymbol)}</p>
          <Link href="/admin/analytics" style={{ fontSize: '14px', color: '#8b5cf6', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            <DirectionArrow kind="forward" /> {t('dash.viewDetails')}
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* Recent Orders */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{t('dash.recentOrders')}</h3>
            <Link href="/admin/orders" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none' }}>{t('dash.viewAll')}</Link>
          </div>
          <div>
            {stats.recentOrders.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontWeight: 600, color: '#111' }}>{t('dash.noOrders')}</p>
                <p style={{ fontSize: '13px', marginTop: '6px' }}>
                  {stats.totalProducts === 0
                    ? t('dash.addProductFirst')
                    : t('dash.noOrdersHint')}
                </p>
                {stats.totalProducts === 0 && (
                  <Link
                    href="/admin/products"
                    style={{
                      display: 'inline-block', marginTop: '14px', padding: '8px 16px',
                      backgroundColor: '#111', color: '#fff', borderRadius: '6px',
                      textDecoration: 'none', fontSize: '13px', fontWeight: 600,
                    }}
                  >
                    {t('dash.addFirstProduct')}
                  </Link>
                )}
              </div>
            ) : (
              stats.recentOrders.map((order: any, index: number) => (
                <div key={order.id || index} style={{ padding: '16px 24px', borderBottom: index < stats.recentOrders.length - 1 ? '1px solid #e5e5e5' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 500 }}>#{order.orderNumber || order.id?.slice(0, 8)}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 600 }}>{formatPrice(order.totalAmount || 0, settings.currencySymbol)}</p>
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '50px', backgroundColor: '#d1fae5', color: '#22c55e' }}>
                      {order.status || 'pending'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Products */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                {stats.topProductsBasis === 'sales' ? t('dash.bestSellers') : t('dash.latestProducts')}
              </h3>
              {/* Say WHICH list this is. Showing newest products under a
                  "best sellers" heading with 0 sold would be misleading. */}
              <p style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                {stats.topProductsBasis === 'sales'
                  ? t('dash.rankedByRevenue')
                  : t('dash.noSalesYet')}
              </p>
            </div>
            <Link href="/admin/products" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none' }}>{t('dash.viewAll')}</Link>
          </div>
          <div>
            {stats.topProducts.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontWeight: 600, color: '#111' }}>{t('dash.noProducts')}</p>
                <p style={{ fontSize: '13px', marginTop: '6px' }}>
                  {t('dash.emptyCatalogue')}
                </p>
                <Link
                  href="/admin/products"
                  style={{
                    display: 'inline-block', marginTop: '14px', padding: '8px 16px',
                    backgroundColor: '#111', color: '#fff', borderRadius: '6px',
                    textDecoration: 'none', fontSize: '13px', fontWeight: 600,
                  }}
                >
                  {t('dash.addFirstProduct')}
                </Link>
              </div>
            ) : (
              stats.topProducts.map((product: any, index: number) => (
                <div key={product.id || index} style={{ padding: '16px 24px', borderBottom: index < stats.topProducts.length - 1 ? '1px solid #e5e5e5' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 500 }}>{product.name}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>
                      {stats.topProductsBasis === 'sales'
                        ? t('dash.soldStock', { n: String(product.sold || 0), stock: String(product.stock ?? 0) })
                        : t('dash.stock', { stock: String(product.stock ?? 0) })}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 600 }}>
                      {formatPrice(
                        stats.topProductsBasis === 'sales' ? product.revenue || 0 : product.price || 0,
                        settings.currencySymbol
                      )}
                    </p>
                    <p style={{ fontSize: '12px', color: '#666' }}>
                      {stats.topProductsBasis === 'sales' ? t('dash.revenue') : t('dash.price')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{t('dash.quickActions')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
          {[
            { href: '/admin/products', icon: '➕', label: t('dash.addProduct') },
            { href: '/admin/orders', icon: '📋', label: t('dash.manageOrders') },
            { href: '/admin/categories', icon: '🏷️', label: t('dash.categories') },
            { href: '/admin/coupons', icon: '🎟️', label: t('nav.coupons') },
            { href: '/admin/users', icon: '👥', label: t('dash.manageUsers') },
            { href: '/admin/analytics', icon: '📊', label: t('nav.analytics') },
          ].map((action) => (
            <Link key={action.href} href={action.href} style={{ padding: '20px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', textDecoration: 'none', color: '#000', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{action.icon}</div>
              <p style={{ fontWeight: 500 }}>{action.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
