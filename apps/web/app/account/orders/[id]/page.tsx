'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const orderId = params?.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        router.push('/login');
        return;
      }

      await fetchOrder(token, orderId);
    } catch (err) {
      console.error('Auth check error:', err);
      setError('Failed to load order. Please try logging in again.');
      setLoading(false);
    }
  };

  const fetchOrder = async (token: string, id: string) => {
    try {
      // First try to get from localStorage
      const localOrders = JSON.parse(localStorage.getItem('orders') || '[]');
      const localOrder = localOrders.find((o: any) => o.id === id || o.orderNumber === id);
      
      if (localOrder) {
        setOrder(localOrder);
        setLoading(false);
        return;
      }

      // Try API
      const response = await api.getOrder(token, id);
      setOrder(response.data);
    } catch (err) {
      console.error('Failed to fetch order:', err);
      // Use mock data for demo
      setOrder({
        id: id,
        orderNumber: 'ORD-2024-001',
        status: 'delivered',
        totalAmount: 1049.98,
        subtotal: 1029.98,
        taxAmount: 103.00,
        shippingAmount: 0,
        discountAmount: 0,
        paymentMethod: 'credit_card',
        paymentStatus: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        shippedAt: '2024-01-16T14:00:00Z',
        deliveredAt: '2024-01-20T09:00:00Z',
        shippingAddress: {
          firstName: 'John',
          lastName: 'Doe',
          address: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
        items: [
          { id: '1', name: 'iPhone 15 Pro', quantity: 1, price: 999.99, variant: '128GB - Natural Titanium' },
          { id: '2', name: 'Classic T-Shirt', quantity: 1, price: 29.99, variant: 'Medium - Black' },
        ],
      });
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

  const getStatusStep = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 0;
      case 'processing': return 1;
      case 'shipped': return 2;
      case 'delivered': return 3;
      case 'cancelled': return -1;
      default: return 0;
    }
  };

  const getItemName = (item: any) => {
    return item.product?.name || item.name || 'Product';
  };

  const getItemPrice = (item: any) => {
    return item.price || item.unitPrice || item.product?.price || 0;
  };

  const getItemVariant = (item: any) => {
    return item.variant?.name || item.variant || null;
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Loading order details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>
        <Link href="/account/orders" style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#000',
          color: '#fff',
          borderRadius: '6px',
          textDecoration: 'none',
        }}>
          Back to Orders
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#666', marginBottom: '16px' }}>Order not found</p>
        <Link href="/account/orders" style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#000',
          color: '#fff',
          borderRadius: '6px',
          textDecoration: 'none',
        }}>
          Back to Orders
        </Link>
      </div>
    );
  }

  const statusStep = getStatusStep(order.status);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <Link href="/account" style={{ textDecoration: 'none', color: '#666' }}>Account</Link>
        <span>/</span>
        <Link href="/account/orders" style={{ textDecoration: 'none', color: '#666' }}>Orders</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>#{order.orderNumber || order.id}</span>
      </nav>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
            Order #{order.orderNumber || order.id}
          </h1>
          <p style={{ color: '#666' }}>
            Placed on {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }) : 'N/A'}
          </p>
        </div>
        <span style={{
          padding: '8px 16px',
          borderRadius: '50px',
          backgroundColor: `${getStatusColor(order.status)}20`,
          color: getStatusColor(order.status),
          fontSize: '14px',
          fontWeight: 600,
          textTransform: 'capitalize',
        }}>
          {order.status || 'pending'}
        </span>
      </div>

      {/* Order Status Timeline */}
      {statusStep >= 0 && (
        <div style={{
          padding: '24px',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px',
          marginBottom: '32px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Order Status</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            {/* Progress Bar */}
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '50px',
              right: '50px',
              height: '4px',
              backgroundColor: '#e5e5e5',
              zIndex: 0,
            }}>
              <div style={{
                width: `${(statusStep / 3) * 100}%`,
                height: '100%',
                backgroundColor: '#22c55e',
                transition: 'width 0.3s',
              }} />
            </div>
            
            {/* Status Steps */}
            {['Pending', 'Processing', 'Shipped', 'Delivered'].map((step, index) => (
              <div key={step} style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: index <= statusStep ? '#22c55e' : '#e5e5e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                  color: index <= statusStep ? 'white' : '#666',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}>
                  {index <= statusStep ? '✓' : index + 1}
                </div>
                <span style={{ fontSize: '12px', color: index <= statusStep ? '#000' : '#666' }}>
                  {step}
                </span>
                {index === 1 && order.shippedAt && (
                  <p style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                    {new Date(order.shippedAt).toLocaleDateString()}
                  </p>
                )}
                {index === 3 && order.deliveredAt && (
                  <p style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                    {new Date(order.deliveredAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '32px' }}>
        {/* Left Column - Order Items */}
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>Order Items</h2>
          <div style={{
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            {order.items?.map((item: any, index: number) => (
              <div key={item.id || index} style={{
                display: 'flex',
                gap: '16px',
                padding: '16px',
                borderBottom: index < order.items.length - 1 ? '1px solid #e5e5e5' : 'none',
              }}>
                {/* Product Image Placeholder */}
                <div style={{
                  width: '80px',
                  height: '80px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  flexShrink: 0,
                }}>
                  📦
                </div>
                
                {/* Product Details */}
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>{getItemName(item)}</h3>
                  {getItemVariant(item) && (
                    <p style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                      {getItemVariant(item)}
                    </p>
                  )}
                  <p style={{ fontSize: '14px', color: '#666' }}>
                    Qty: {item.quantity || 1}
                  </p>
                </div>
                
                {/* Price */}
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 600 }}>${(getItemPrice(item) * (item.quantity || 1)).toFixed(2)}</p>
                  <p style={{ fontSize: '12px', color: '#666' }}>${getItemPrice(item).toFixed(2)} each</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column - Order Summary */}
        <div>
          {/* Payment Info */}
          <div style={{
            padding: '24px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Payment</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#666' }}>Method</span>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                {order.paymentMethod?.replace('_', ' ') || 'Credit Card'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#666' }}>Status</span>
              <span style={{ 
                fontWeight: 500, 
                color: order.paymentStatus === 'completed' ? '#22c55e' : '#f59e0b',
                textTransform: 'capitalize',
              }}>
                {order.paymentStatus || 'pending'}
              </span>
            </div>
          </div>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div style={{
              padding: '24px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              marginBottom: '24px',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Shipping Address</h2>
              <p style={{ fontWeight: 500 }}>
                {order.shippingAddress.firstName} {order.shippingAddress.lastName}
              </p>
              <p style={{ color: '#666' }}>{order.shippingAddress.address}</p>
              <p style={{ color: '#666' }}>
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}
              </p>
              <p style={{ color: '#666' }}>{order.shippingAddress.country}</p>
            </div>
          )}

          {/* Order Summary */}
          <div style={{
            padding: '24px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: '#f9f9f9',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Order Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span style={{ fontWeight: 500 }}>${Number(order.subtotal || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Shipping</span>
                <span style={{ fontWeight: 500 }}>
                  {order.shippingAmount === 0 ? (
                    <span style={{ color: '#22c55e' }}>Free</span>
                  ) : (
                    `$${Number(order.shippingAmount || 0).toFixed(2)}`
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Tax</span>
                <span style={{ fontWeight: 500 }}>${Number(order.taxAmount || 0).toFixed(2)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#22c55e' }}>
                    Discount {order.couponCode ? `(${order.couponCode})` : ''}
                  </span>
                  <span style={{ fontWeight: 500, color: '#22c55e' }}>-${Number(order.discountAmount).toFixed(2)}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Total</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>${Number(order.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tracking Info */}
          {order.trackingNumber && (
            <div style={{
              padding: '16px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              marginBottom: '16px',
              backgroundColor: '#f0f9ff',
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Tracking Number</h3>
              <p style={{ fontFamily: 'monospace', fontSize: '16px', color: '#3b82f6' }}>{order.trackingNumber}</p>
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Link href={`/track-order`} style={{
              display: 'block',
              textAlign: 'center',
              padding: '12px',
              backgroundColor: '#000',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
            }}>
              🚚 Track Order
            </Link>
            <Link href="/account/orders" style={{
              display: 'block',
              textAlign: 'center',
              padding: '12px',
              backgroundColor: 'white',
              color: '#000',
              border: '1px solid #000',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
            }}>
              ← Back to Orders
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}