'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalUsers: 0,
    totalRevenue: 0,
    recentOrders: [],
    topProducts: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Fetch products count
      let products = [];
      try {
        const productsRes = await api.getProducts({ limit: 100 });
        products = productsRes.data || [];
      } catch (e) {
        console.error('Failed to fetch products:', e);
      }

      // Fetch orders
      let orders = [];
      try {
        const ordersRes = await api.getOrders(token);
        orders = ordersRes.data || [];
      } catch (e) {
        console.error('Failed to fetch orders:', e);
      }

      // Calculate stats
      const totalRevenue = orders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0);

      setStats({
        totalProducts: products.length,
        totalOrders: orders.length,
        totalUsers: 2, // Mock - admin + customer
        totalRevenue,
        recentOrders: orders.slice(0, 5),
        topProducts: products.slice(0, 5),
      });
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <p style={{ color: '#666' }}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Products</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalProducts}</p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#dbeafe',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
            }}>
              📦
            </div>
          </div>
          <Link href="/admin/products" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            View all →
          </Link>
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Orders</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalOrders}</p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#fef3c7',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
            }}>
              🛒
            </div>
          </div>
          <Link href="/admin/orders" style={{ fontSize: '14px', color: '#f59e0b', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            View all →
          </Link>
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Users</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalUsers}</p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#d1fae5',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
            }}>
              👥
            </div>
          </div>
          <Link href="/admin/users" style={{ fontSize: '14px', color: '#22c55e', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            View all →
          </Link>
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Revenue</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold' }}>${stats.totalRevenue.toFixed(2)}</p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#ede9fe',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
            }}>
              💰
            </div>
          </div>
          <Link href="/admin/analytics" style={{ fontSize: '14px', color: '#8b5cf6', textDecoration: 'none', marginTop: '12px', display: 'block' }}>
            View details →
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Recent Orders */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Recent Orders</h3>
            <Link href="/admin/orders" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none' }}>
              View all
            </Link>
          </div>
          <div>
            {stats.recentOrders.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                No orders yet
              </div>
            ) : (
              stats.recentOrders.map((order: any, index: number) => (
                <div key={order.id || index} style={{
                  padding: '16px 24px',
                  borderBottom: index < stats.recentOrders.length - 1 ? '1px solid #e5e5e5' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <p style={{ fontWeight: 500 }}>#{order.orderNumber || order.id}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 600 }}>${Number(order.totalAmount || 0).toFixed(2)}</p>
                    <span style={{
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '50px',
                      backgroundColor: order.status === 'delivered' ? '#d1fae5' : '#fef3c7',
                      color: order.status === 'delivered' ? '#22c55e' : '#f59e0b',
                    }}>
                      {order.status || 'pending'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Products */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Products</h3>
            <Link href="/admin/products" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none' }}>
              View all
            </Link>
          </div>
          <div>
            {stats.topProducts.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                No products yet
              </div>
            ) : (
              stats.topProducts.map((product: any, index: number) => (
                <div key={product.id || index} style={{
                  padding: '16px 24px',
                  borderBottom: index < stats.topProducts.length - 1 ? '1px solid #e5e5e5' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                    }}>
                      📦
                    </div>
                    <div>
                      <p style={{ fontWeight: 500 }}>{product.name}</p>
                      <p style={{ fontSize: '12px', color: '#666' }}>{product.category?.name}</p>
                    </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <Link href="/admin/products" style={{
            padding: '20px',
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e5e5',
            textDecoration: 'none',
            color: '#000',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>➕</div>
            <p style={{ fontWeight: 500 }}>Add Product</p>
          </Link>
          <Link href="/admin/orders" style={{
            padding: '20px',
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e5e5',
            textDecoration: 'none',
            color: '#000',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
            <p style={{ fontWeight: 500 }}>Manage Orders</p>
          </Link>
          <Link href="/admin/users" style={{
            padding: '20px',
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e5e5',
            textDecoration: 'none',
            color: '#000',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
            <p style={{ fontWeight: 500 }}>Manage Users</p>
          </Link>
          <Link href="/admin/analytics" style={{
            padding: '20px',
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e5e5',
            textDecoration: 'none',
            color: '#000',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
            <p style={{ fontWeight: 500 }}>View Analytics</p>
          </Link>
        </div>
      </div>
    </div>
  );
}