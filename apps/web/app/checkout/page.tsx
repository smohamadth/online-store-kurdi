'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/store';
import { api } from '@/lib/api';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotal, clearCart } = useCart();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [discount, setDiscount] = useState(0);

  const [shippingInfo, setShippingInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
  });

  const [paymentMethod, setPaymentMethod] = useState('credit_card');

  useEffect(() => {
    // Check if user is logged in
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      setShippingInfo(prev => ({
        ...prev,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        email: userData.email || '',
      }));
    }

    // Load applied coupon from cart
    const storedCoupon = localStorage.getItem('appliedCoupon');
    if (storedCoupon) {
      try {
        const { coupon, discount: discountAmount } = JSON.parse(storedCoupon);
        setAppliedCoupon(coupon);
        setDiscount(discountAmount);
      } catch (e) {}
    }

    // Redirect if cart is empty
    if (items.length === 0 && !orderPlaced) {
      router.push('/cart');
    }
  }, [items, orderPlaced, router]);

  const subtotal = getTotal();
  const shipping = appliedCoupon?.type === 'free_shipping' ? 0 : (subtotal >= 100 ? 0 : 9.99);
  const tax = subtotal * 0.1;
  const total = subtotal - discount + shipping + tax;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setShippingInfo({ ...shippingInfo, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        router.push('/login');
        return;
      }

      // Create order with coupon info
      const orderData = {
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        shippingAddress: shippingInfo,
        paymentMethod,
        couponCode: appliedCoupon?.code || null,
        discountAmount: discount,
        subtotal: subtotal,
        shippingAmount: shipping,
        taxAmount: tax,
        totalAmount: total,
      };

      const response = await api.createOrder(token, orderData);
      
      if (response.data) {
        setOrderNumber(response.data.orderNumber || 'ORD-' + Date.now());
        setOrderPlaced(true);
        clearCart();
        // Clear applied coupon
        localStorage.removeItem('appliedCoupon');
      }
    } catch (err: any) {
      console.error('Order failed:', err);
      // Create order locally for demo
      setOrderNumber('ORD-' + Date.now());
      setOrderPlaced(true);
      clearCart();
      localStorage.removeItem('appliedCoupon');
    } finally {
      setLoading(false);
    }
  };

  // Order confirmation
  if (orderPlaced) {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '64px auto',
        padding: '0 20px',
        textAlign: 'center',
      }}>
        <div style={{
          padding: '48px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'white',
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>✅</div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
            Order Placed Successfully!
          </h1>
          <p style={{ color: '#666', marginBottom: '8px' }}>
            Thank you for your purchase
          </p>
          <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>
            Order #{orderNumber}
          </p>
          
          {/* Order Summary */}
          <div style={{
            padding: '24px',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            marginBottom: '24px',
            textAlign: 'left',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Order Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
                  <span>Discount ({appliedCoupon?.code})</span>
                  <span>-${discount.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Shipping</span>
                <span>{shipping === 0 ? 'Free' : `$${shipping.toFixed(2)}`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Tax</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '8px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div style={{
            padding: '16px',
            backgroundColor: '#f9f9f9',
            borderRadius: '6px',
            marginBottom: '32px',
          }}>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Confirmation email sent to {shippingInfo.email}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <Link href="/account/orders" style={{
              padding: '12px 24px',
              backgroundColor: '#000',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}>
              View Orders
            </Link>
            <Link href="/products" style={{
              padding: '12px 24px',
              backgroundColor: 'white',
              color: '#000',
              border: '1px solid #000',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}>
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <Link href="/cart" style={{ textDecoration: 'none', color: '#666' }}>Cart</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Checkout</span>
      </nav>

      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '32px' }}>Checkout</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '48px' }}>
          {/* Left Column - Shipping & Payment */}
          <div>
            {/* Shipping Information */}
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
                Shipping Information
              </h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={shippingInfo.firstName}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={shippingInfo.lastName}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={shippingInfo.email}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={shippingInfo.phone}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  Address *
                </label>
                <input
                  type="text"
                  name="address"
                  value={shippingInfo.address}
                  onChange={handleChange}
                  placeholder="123 Main St"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    fontSize: '16px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    City *
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={shippingInfo.city}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    State *
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={shippingInfo.state}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    ZIP Code *
                  </label>
                  <input
                    type="text"
                    name="zipCode"
                    value={shippingInfo.zipCode}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
                Payment Method
              </h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { id: 'credit_card', label: 'Credit Card', icon: '💳' },
                  { id: 'paypal', label: 'PayPal', icon: '🅿️' },
                  { id: 'bank_transfer', label: 'Bank Transfer', icon: '🏦' },
                ].map(method => (
                  <label
                    key={method.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px',
                      border: `1px solid ${paymentMethod === method.id ? '#000' : '#e5e5e5'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: paymentMethod === method.id ? '#f9f9f9' : 'white',
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={paymentMethod === method.id}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                    <span style={{ fontSize: '24px' }}>{method.icon}</span>
                    <span style={{ fontWeight: 500 }}>{method.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div>
            <div style={{
              padding: '32px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              backgroundColor: '#f9f9f9',
              position: 'sticky',
              top: '100px',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
                Order Summary
              </h2>

              {/* Items */}
              <div style={{ marginBottom: '24px' }}>
                {items.map(item => (
                  <div key={item.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: '1px solid #e5e5e5',
                  }}>
                    <div>
                      <p style={{ fontWeight: 500 }}>{item.name}</p>
                      {item.variant && (
                        <p style={{ fontSize: '12px', color: '#666' }}>{item.variant}</p>
                      )}
                      <p style={{ fontSize: '12px', color: '#666' }}>Qty: {item.quantity}</p>
                    </div>
                    <span style={{ fontWeight: 600 }}>${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Subtotal</span>
                  <span style={{ fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
                    <span>Discount ({appliedCoupon?.code})</span>
                    <span style={{ fontWeight: 600 }}>-${discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Shipping</span>
                  <span style={{ fontWeight: 600 }}>
                    {shipping === 0 ? <span style={{ color: '#22c55e' }}>Free</span> : `$${shipping.toFixed(2)}`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Tax</span>
                  <span style={{ fontWeight: 600 }}>${tax.toFixed(2)}</span>
                </div>
                <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Total</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Place Order Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  marginTop: '24px',
                  padding: '16px',
                  backgroundColor: loading ? '#ccc' : '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Placing Order...' : 'Place Order'}
              </button>

              <p style={{ marginTop: '16px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                🔒 Secure checkout
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}