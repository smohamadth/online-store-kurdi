'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { API_BASE } from '@/lib/http';

export default function TrackOrderPage() {
  const { settings } = useStoreSettings();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setOrder(null);

    try {
      // Look the order up in the DATABASE. This previously searched
      // localStorage first, so an order that never reached the server still
      // appeared "trackable" - reinforcing the illusion that it existed.
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please sign in to track your order.');
        return;
      }
      const response = await fetch(`${API_BASE}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        setError('Could not reach the server. Please try again.');
        return;
      }

      const data = await response.json();
      const apiOrder = data.data?.find((o: any) => o.orderNumber === orderNumber);
      if (apiOrder) {
        setOrder(apiOrder);
      } else {
        setError('Order not found. Please check your order number.');
      }
    } catch (err) {
      setError('Failed to track order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusStep = (status: string) => {
    const steps = ['pending', 'processing', 'shipped', 'delivered'];
    return steps.indexOf(status?.toLowerCase() || 'pending');
  };

  const statusSteps = [
    { key: 'pending', label: 'Order Placed', icon: '📋' },
    { key: 'processing', label: 'Processing', icon: '⚙️' },
    { key: 'shipped', label: 'Shipped', icon: '🚚' },
    { key: 'delivered', label: 'Delivered', icon: '✅' },
  ];

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Track Your Order</h1>
      <p style={{ color: '#666', marginBottom: '32px' }}>
        Enter your order number to track your shipment.
      </p>

      <form onSubmit={handleTrack} style={{
        padding: '24px',
        border: '1px solid #e5e5e5',
        borderRadius: '8px',
        backgroundColor: 'var(--card-bg, white)',
        marginBottom: '32px',
      }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
            Order Number *
          </label>
          <input
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="ORD-1234567890"
            required
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
            Email (optional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: loading ? '#ccc' : '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Tracking...' : 'Track Order'}
        </button>
      </form>

      {error && (
        <div style={{
          padding: '16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#ef4444',
          marginBottom: '24px',
        }}>
          {error}
        </div>
      )}

      {order && (
        <div style={{
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'var(--card-bg, white)',
          overflow: 'hidden',
        }}>
          {/* Order Header */}
          <div style={{ padding: '20px', borderBottom: '1px solid #e5e5e5', backgroundColor: '#f9f9f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Order #{order.orderNumber}</h2>
                <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                  Placed on {new Date(order.createdAt).toLocaleDateString('en-US', { 
                    year: 'numeric', month: 'long', day: 'numeric' 
                  })}
                </p>
              </div>
              <span style={{
                padding: '6px 12px',
                backgroundColor: order.status === 'delivered' ? '#d1fae5' : order.status === 'shipped' ? '#dbeafe' : '#fef3c7',
                color: order.status === 'delivered' ? '#22c55e' : order.status === 'shipped' ? '#3b82f6' : '#f59e0b',
                borderRadius: '50px',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}>
                {order.status}
              </span>
            </div>
          </div>

          {/* Status Timeline */}
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: '32px' }}>
              {/* Progress line */}
              <div style={{
                position: 'absolute',
                top: '20px',
                left: '40px',
                right: '40px',
                height: '4px',
                backgroundColor: '#e5e5e5',
                zIndex: 0,
              }}>
                <div style={{
                  width: `${Math.max(0, getStatusStep(order.status)) * 33.33}%`,
                  height: '100%',
                  backgroundColor: '#22c55e',
                  transition: 'width 0.3s',
                }} />
              </div>

              {statusSteps.map((step, i) => {
                const isActive = getStatusStep(order.status) >= i;
                const isCurrent = order.status === step.key;
                return (
                  <div key={step.key} style={{ 
                    textAlign: 'center', 
                    position: 'relative', 
                    zIndex: 1,
                    flex: 1,
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: isActive ? '#22c55e' : '#e5e5e5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                      fontSize: '18px',
                      border: isCurrent ? '3px solid #22c55e' : 'none',
                    }}>
                      {step.icon}
                    </div>
                    <p style={{ 
                      fontSize: '12px', 
                      fontWeight: isCurrent ? 600 : 400,
                      color: isActive ? '#000' : '#999',
                    }}>
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Tracking Info */}
            {order.trackingNumber && (
              <div style={{
                padding: '16px',
                backgroundColor: '#f0f9ff',
                borderRadius: '6px',
                marginBottom: '20px',
              }}>
                <p style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Tracking Number</p>
                <p style={{ fontSize: '16px', fontFamily: 'monospace', color: '#3b82f6' }}>{order.trackingNumber}</p>
              </div>
            )}

            {/* Order Items */}
            {order.items && order.items.length > 0 && (
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Items</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {order.items.map((item: any, i: number) => (
                    <div key={i} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px',
                      backgroundColor: '#f9f9f9',
                      borderRadius: '6px',
                    }}>
                      <div>
                        <p style={{ fontWeight: 500 }}>{item.name || item.product?.name || 'Product'}</p>
                        <p style={{ fontSize: '13px', color: '#666' }}>Qty: {item.quantity || 1}</p>
                      </div>
                      <p style={{ fontWeight: 600 }}>{formatPrice((item.price || 0) * (item.quantity || 1), settings.currencySymbol)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Order Total */}
            <div style={{
              marginTop: '20px',
              padding: '16px',
              borderTop: '1px solid #e5e5e5',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px' }}>
                <span>Total</span>
                <span>{formatPrice(order.totalAmount || 0, settings.currencySymbol)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <Link href="/account/orders" style={{ color: '#000', textDecoration: 'underline', fontSize: '14px' }}>
          View all orders in your account
        </Link>
      </div>
    </div>
  );
}
