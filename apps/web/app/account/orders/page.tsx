'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { useIsMobile } from '@/lib/hooks';

export default function OrdersPage() {
  const isMobile = useIsMobile();
  const { settings } = useStoreSettings();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Try API
      let apiOrders: any[] = [];
      try {
        const response = await api.getOrders(token);
        apiOrders = response.data || [];
      } catch (err) {
        console.log('API not available');
      }

      // Get local orders
      const localOrders = JSON.parse(localStorage.getItem('orders') || '[]');

      // Merge
      const allOrders = [...apiOrders];
      localOrders.forEach((localOrder: any) => {
        if (!allOrders.find(o => o.id === localOrder.id || o.orderNumber === localOrder.orderNumber)) {
          allOrders.push(localOrder);
        }
      });

      // Sort by date
      allOrders.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setOrders(allOrders);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
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
      default: return '#666';
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px', color: '#666' }}>Loading orders...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
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
              {/* Order Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>
                    Order #{order.orderNumber || order.id}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#666' }}>
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    }) : 'N/A'}
                  </p>
                </div>
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

              {/* Order Items */}
              {order.items && order.items.length > 0 && (
                <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '6px', marginBottom: '16px' }}>
                  {order.items.map((item: any, index: number) => (
                    <div key={item.id || index} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: index < order.items.length - 1 ? '1px solid #e5e5e5' : 'none',
                    }}>
                      <span style={{ fontWeight: 500 }}>{item.name || item.product?.name || 'Product'}</span>
                      <span style={{ fontWeight: 600 }}>{formatPrice((item.price || 0) * (item.quantity || 1), settings.currencySymbol)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Order Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {order.discountAmount > 0 && (
                    <p style={{ fontSize: '14px', color: '#22c55e', marginBottom: '4px' }}>
                      Discount: -{formatPrice(order.discountAmount, settings.currencySymbol)}
                      {order.couponCode && ` (${order.couponCode})`}
                    </p>
                  )}
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    Total: {formatPrice(order.totalAmount || 0, settings.currencySymbol)}
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
  );
}
