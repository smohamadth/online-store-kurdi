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

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!storedUser || !token) {
      router.push('/login');
      return;
    }

    setUser(JSON.parse(storedUser));
    fetchOrders(token);
  }, [router]);

  const fetchOrders = async (token: string) => {
    try {
      const response = await api.getOrders(token);
      setOrders(response.data || []);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      // Use mock orders for demo
      setOrders([
        {
          id: '1',
          orderNumber: 'ORD-2024-001',
          status: 'delivered',
          totalAmount: 1049.98,
          createdAt: '2024-01-15T10:30:00Z',
          items: [
            { name: 'iPhone 15 Pro', quantity: 1, price: 999.99 },
            { name: 'Classic T-Shirt', quantity: 1, price: 29.99 },
          ],
        },
        {
          id: '2',
          orderNumber: 'ORD-2024-002',
          status: 'processing',
          totalAmount: 49.99,
          createdAt: '2024-01-20T14:20:00Z',
          items: [
            { name: 'Web Development Course', quantity: 1, price: 49.99 },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return '#22c55e';
      case 'processing': return '#f59e0b';
      case 'shipped': return '#3b82f6';
      case 'cancelled': return '#ef4444';
      default: return '#666';
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Loading orders...</p>
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
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                  }}>
                    <div>
                      <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>
                        Order #{order.orderNumber}
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        Placed on {new Date(order.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
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
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '6px',
                    marginBottom: '16px',
                  }}>
                    {order.items?.map((item: any, index: number) => (
                      <div key={index} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: index < order.items.length - 1 ? '1px solid #e5e5e5' : 'none',
                      }}>
                        <div>
                          <span style={{ fontWeight: 500 }}>{item.name}</span>
                          <span style={{ color: '#666', marginLeft: '8px' }}>x{item.quantity}</span>
                        </div>
                        <span style={{ fontWeight: 600 }}>${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      Total: ${order.totalAmount?.toFixed(2) || '0.00'}
                    </span>
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