'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';

export default function AdminDashboard() {
  const { settings } = useStoreSettings();
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalUsers: 0,
    totalCategories: 0,
    totalRevenue: 0,
    recentOrders: [],
    topProducts: [],
  });
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      let products: any[] = [];
      let orders: any[] = [];
      let categories: any[] = [];

      // Fetch products
      try {
        const productsRes = await api.getProducts({ limit: 100 });
        products = productsRes.data || [];
      } catch (e) {}

      // Fetch orders
      try {
        const ordersRes = await api.getOrders(token);
        orders = ordersRes.data || [];
      } catch (e) {
        // Fallback to local orders
        orders = JSON.parse(localStorage.getItem('orders') || '[]');
      }

      // Fetch categories
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/categories`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          categories = data.data || [];
        }
      } catch (e) {}

      // Calculate stats
      const totalRevenue = orders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0);

      setStats({
        totalProducts: products.length,
        totalOrders: orders.length,
        totalUsers: 2, // admin + customer
        totalCategories: categories.length,
        totalRevenue,
        recentOrders: orders.slice(0, 5),
        topProducts: products.slice(0, 5),
      });

      if (products.length > 0 || orders.length > 0) {
        setApiStatus('connected');
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}><p style={{ color: '#666' }}>Loading dashboard...</p></div>;
  }

  return (
    <div>
      {/* API Status */}
      {apiStatus === 'disconnected' && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>Start API for full functionality: <code>npm run dev:api</code></p>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Products</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalProducts}</p>
          <Link href="/admin/products" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            Manage →
          </Link>
        </div>

        <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Orders</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalOrders}</p>
          <Link href="/admin/orders" style={{ fontSize: '14px', color: '#f59e0b', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            Manage →
          </Link>
        </div>

        <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Categories</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalCategories}</p>
          <Link href="/admin/categories" style={{ fontSize: '14px', color: '#22c55e', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            Manage →
          </Link>
        </div>

        <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Revenue</p>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatPrice(stats.totalRevenue, settings.currencySymbol)}</p>
          <Link href="/admin/analytics" style={{ fontSize: '14px', color: '#8b5cf6', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            View details →
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* Recent Orders */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Recent Orders</h3>
            <Link href="/admin/orders" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none' }}>View all</Link>
          </div>
          <div>
            {stats.recentOrders.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>No orders yet</div>
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
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Products</h3>
            <Link href="/admin/products" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none' }}>View all</Link>
          </div>
          <div>
            {stats.topProducts.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>No products yet</div>
            ) : (
              stats.topProducts.map((product: any, index: number) => (
                <div key={product.id || index} style={{ padding: '16px 24px', borderBottom: index < stats.topProducts.length - 1 ? '1px solid #e5e5e5' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 500 }}>{product.name}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>{product.category?.name}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 600 }}>${product.price}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>Stock: {product.quantity || 0}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginTop: '32px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
          {[
            { href: '/admin/products', icon: '➕', label: 'Add Product' },
            { href: '/admin/orders', icon: '📋', label: 'Manage Orders' },
            { href: '/admin/categories', icon: '🏷️', label: 'Categories' },
            { href: '/admin/coupons', icon: '🎟️', label: 'Coupons' },
            { href: '/admin/users', icon: '👥', label: 'Manage Users' },
            { href: '/admin/analytics', icon: '📊', label: 'Analytics' },
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
