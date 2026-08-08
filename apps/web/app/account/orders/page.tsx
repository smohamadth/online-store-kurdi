'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function OrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');

      if (!storedUser || !token) {
        router.push('/login');
        return;
      }

      // Parse user with error handling
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse user:', e);
        router.push('/login');
        return;
      }

      await fetchOrders(token);
    } catch (err) {
      console.error('Auth check error:', err);
      setError('Failed to load orders. Please try logging in again.');
      setLoading(false);
    }
  };

  const fetchOrders = async (token: string) => {
    try {
      // Try API first
      let apiOrders: any[] = [];
      try {
        const response = await api.getOrders(token);
        apiOrders = response.data || [];
        if (apiOrders.length > 0) {
          setApiStatus('connected');
        }
      } catch (err) {
        console.log('Orders API not available');
        setApiStatus('disconnected');
      }

      // Get locally stored orders
      const localOrders = JSON.parse(localStorage.getItem('orders') || '[]');

      // Merge: API orders first, then local orders (avoid duplicates)
      const allOrders = [...apiOrders];
      localOrders.forEach((localOrder: any) => {
        if (!allOrders.find(o => o.id === localOrder.id || o.orderNumber === localOrder.orderNumber)) {
          allOrders.push(localOrder);
        }
      });

      // Sort by date (newest first)
      allOrders.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setOrders(allOrders);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      // Fallback to local orders only
      const localOrders = JSON.parse(localStorage.getItem('orders') || '[]');
      setOrders(localOrders);
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

  // Get item name from order item (handles different API structures)
  const getItemName = (item: any) => {
    // API might return: item.product.name or item.name
    return item.product?.name || item.name || 'Product';
  };

  // Get item price from order item
  const getItemPrice = (item: any) => {
    return item.price || item.unitPrice || item.product?.price || 0;
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Loading orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>
        <Link href="/login" style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#000',
          color: '#fff',
          borderRadius: '6px',
          textDecoration: 'none',
        }}>
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <Link href="/account" style={{ textDecoration: 'none', color: '#666' }}>Account</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Orders</span>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '48px' }}>
        {/* Sidebar */}
        <div>
          <div style={{
            padding: '24px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: 'white',
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#f5f5f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              margin: '0 auto 12px',
            }}>
              👤
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', textAlign: 'center', marginBottom: '16px' }}>
              {user?.firstName} {user?.lastName}
            </h2>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link href="/account" style={{
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Dashboard
              </Link>
              <Link href="/account/orders" style={{
                padding: '10px 16px',
                backgroundColor: '#f5f5f5',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#000',
                fontWeight: 500,
              }}>
                Orders
              </Link>
              <Link href="/wishlist" style={{
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Wishlist
              </Link>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '32px' }}>
            My Orders
          </h1>

          {/* API Status */}
          {apiStatus === 'disconnected' && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '6px',
              marginBottom: '24px',
              fontSize: '14px',
              color: '#92400e',
            }}>
              ⚠️ Showing local orders. Start API to sync with database.
            </div>
          )}

          {orders.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '64px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
              <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No orders yet</h2>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                Start shopping to see your orders here
              </p>
              <Link href="/products" style={{
                display: 'inline-block',
                padding: '12px 24px',
                backgroundColor: '#000',
                color: '#fff',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: 600,
              }}>
                Browse Products
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {orders.map((order) => (
                <div key={order.id} style={{
                  padding: '24px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                }}>
                  {/* Order Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                  }}>
                    <div>
                      <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>
                        Order #{order.orderNumber || order.id}
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        Placed on {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }) : 'N/A'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        padding: '6px 12px',
                        borderRadius: '50px',
                        backgroundColor: `${getStatusColor(order.status)}20`,
                        color: getStatusColor(order.status),
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}>
                        {order.status || 'pending'}
                      </span>
                    </div>
                  </div>

                  {/* Order Items */}
                  {order.items && order.items.length > 0 && (
                    <div style={{
                      padding: '16px',
                      backgroundColor: '#f9f9f9',
                      borderRadius: '6px',
                      marginBottom: '16px',
                    }}>
                      {order.items.map((item: any, index: number) => (
                        <div key={item.id || index} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: index < order.items.length - 1 ? '1px solid #e5e5e5' : 'none',
                        }}>
                          <div>
                            <span style={{ fontWeight: 500 }}>{getItemName(item)}</span>
                            <span style={{ color: '#666', marginLeft: '8px' }}>x{item.quantity || 1}</span>
                          </div>
                          <span style={{ fontWeight: 600 }}>
                            ${(getItemPrice(item) * (item.quantity || 1)).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Order Footer */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                  }}>
                    <div>
                      {order.discountAmount > 0 && (
                        <p style={{ fontSize: '14px', color: '#22c55e', marginBottom: '4px' }}>
                          Discount: -${Number(order.discountAmount).toFixed(2)}
                          {order.couponCode && ` (${order.couponCode})`}
                        </p>
                      )}
                      <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                        Total: ${Number(order.totalAmount || 0).toFixed(2)}
                      </span>
                    </div>
                    <Link href={`/account/orders/${order.id}`} style={{
                      padding: '10px 20px',
                      backgroundColor: '#000',
                      color: '#fff',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}>
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}