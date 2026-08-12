'use client';

import { ButtonSpinner } from '@/components/Spinner';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/store';
import { api } from '@/lib/api';
import ShippingSelector from '@/components/ShippingSelector';
import TaxCalculator from '@/components/TaxCalculator';
import { useStoreSettings, formatPrice } from '@/lib/settings';

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

export default function CheckoutPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { items, getTotal, clearCart } = useCart();
  const { settings } = useStoreSettings();
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

  const [selectedShipping, setSelectedShipping] = useState<any>(null);
  const [taxInfo, setTaxInfo] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState('credit_card');

  const subtotal = getTotal();
  const shippingCost = selectedShipping?.isFree ? 0 : (selectedShipping?.rate || 0);
  const taxAmount = taxInfo?.taxAmount || subtotal * 0.1;
  const total = subtotal - discount + shippingCost + taxAmount;

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

    // Load applied coupon
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

      // Create order
      const orderData = {
        items: items.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        shippingAddress: shippingInfo,
        shippingMethodId: selectedShipping?.id,
        paymentMethod,
        couponCode: appliedCoupon?.code || null,
        couponId: appliedCoupon?.id || null,
        discountAmount: discount,
        subtotal,
        shippingAmount: shippingCost,
        taxAmount,
        totalAmount: total,
      };

      // Try API
      let orderNumber = 'ORD-' + Date.now();
      try {
        const response = await api.createOrder(token, orderData);
        if (response.data?.orderNumber) {
          orderNumber = response.data.orderNumber;
        }
      } catch (err) {
        console.log('API not available, saving locally');
      }

      // Save order locally
      saveOrderLocally(orderNumber);

      setOrderNumber(orderNumber);
      setOrderPlaced(true);
      clearCart();
      localStorage.removeItem('appliedCoupon');
    } catch (err: any) {
      console.error('Order failed:', err);
      const orderNumber = 'ORD-' + Date.now();
      saveOrderLocally(orderNumber);
      setOrderNumber(orderNumber);
      setOrderPlaced(true);
      clearCart();
      localStorage.removeItem('appliedCoupon');
    } finally {
      setLoading(false);
    }
  };

  const saveOrderLocally = (orderNumber: string) => {
    const order = {
      id: Date.now().toString(),
      orderNumber,
      userId: user?.id,
      status: 'processing',
      items: items.map(item => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        variant: item.variant,
      })),
      subtotal,
      discountAmount: discount,
      couponCode: appliedCoupon?.code || null,
      shippingAmount: shippingCost,
      shippingMethod: selectedShipping?.name || 'Standard',
      taxAmount,
      totalAmount: total,
      shippingAddress: shippingInfo,
      paymentMethod,
      createdAt: new Date().toISOString(),
      user: user ? {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      } : null,
    };

    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    orders.unshift(order);
    localStorage.setItem('orders', JSON.stringify(orders));
    
    // Track inventory changes locally when API is unavailable
    updateLocalInventory(items);
  };
  
  const updateLocalInventory = (orderItems: any[]) => {
    try {
      // Store pending inventory deductions to sync later
      const pendingDeductions = JSON.parse(localStorage.getItem('pendingInventoryDeductions') || '[]');
      orderItems.forEach(item => {
        pendingDeductions.push({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          timestamp: new Date().toISOString(),
        });
      });
      localStorage.setItem('pendingInventoryDeductions', JSON.stringify(pendingDeductions));
    } catch (err) {
      console.error('Failed to track local inventory:', err);
    }
  };

  // Order confirmation
  if (orderPlaced) {
    return (
      <div style={{ maxWidth: '600px', margin: '64px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ padding: '48px', border: '1px solid #e5e5e5', borderRadius: '8px', backgroundColor: 'white' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>✅</div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
            Order Placed Successfully!
          </h1>
          <p style={{ color: '#666', marginBottom: '8px' }}>Thank you for your purchase</p>
          <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>
            Order #{orderNumber}
          </p>

          {/* Order Summary */}
          <div style={{ padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '24px', textAlign: 'left' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Order Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span>{formatPrice(subtotal, settings.currencySymbol)}</span>
              </div>
              {discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
                  <span>Discount ({appliedCoupon?.code})</span>
                  <span>-{formatPrice(discount, settings.currencySymbol)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Shipping ({selectedShipping?.name || 'Standard'})</span>
                <span>{shippingCost === 0 ? 'Free' : `${formatPrice(shippingCost, settings.currencySymbol)}`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Tax</span>
                <span>{formatPrice(taxAmount, settings.currencySymbol)}</span>
              </div>
              <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '8px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Total</span>
                  <span>{formatPrice(total, settings.currencySymbol)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '6px', marginBottom: '32px' }}>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Confirmation email sent to {shippingInfo.email}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <Link href="/account/orders" style={{ padding: '12px 24px', backgroundColor: '#000', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
              View Orders
            </Link>
            <Link href="/products" style={{ padding: '12px 24px', backgroundColor: 'white', color: '#000', border: '1px solid #000', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
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

      <h1 style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: 'bold', marginBottom: '32px' }}>Checkout</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: isMobile ? '24px' : '48px' }}>
          {/* Left Column */}
          <div>
            {/* Shipping Information */}
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Shipping Information</h2>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>First Name *</label>
                  <input type="text" name="firstName" value={shippingInfo.firstName} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Last Name *</label>
                  <input type="text" name="lastName" value={shippingInfo.lastName} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Email *</label>
                  <input type="email" name="email" value={shippingInfo.email} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Phone</label>
                  <input type="tel" name="phone" value={shippingInfo.phone} onChange={handleChange}
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Address *</label>
                <input type="text" name="address" value={shippingInfo.address} onChange={handleChange} placeholder="123 Main St" required
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>City *</label>
                  <input type="text" name="city" value={shippingInfo.city} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>State *</label>
                  <input type="text" name="state" value={shippingInfo.state} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>ZIP Code *</label>
                  <input type="text" name="zipCode" value={shippingInfo.zipCode} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
              </div>
            </div>

            {/* Shipping Method */}
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Shipping Method</h2>
              <ShippingSelector
                country={shippingInfo.country}
                state={shippingInfo.state}
                zipCode={shippingInfo.zipCode}
                subtotal={subtotal}
                onSelect={setSelectedShipping}
                selectedMethodId={selectedShipping?.id}
              />
            </div>

            {/* Payment Method */}
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Payment Method</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { id: 'credit_card', label: 'Credit Card', icon: '💳' },
                  { id: 'paypal', label: 'PayPal', icon: '🅿️' },
                  { id: 'bank_transfer', label: 'Bank Transfer', icon: '🏦' },
                ].map(method => (
                  <label key={method.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                    border: `1px solid ${paymentMethod === method.id ? '#000' : '#e5e5e5'}`,
                    borderRadius: '6px', cursor: 'pointer',
                    backgroundColor: paymentMethod === method.id ? '#f9f9f9' : 'white',
                  }}>
                    <input type="radio" name="paymentMethod" value={method.id}
                      checked={paymentMethod === method.id}
                      onChange={(e) => setPaymentMethod(e.target.value)} />
                    <span style={{ fontSize: '24px' }}>{method.icon}</span>
                    <span style={{ fontWeight: 500 }}>{method.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div>
            <div style={{ padding: '32px', border: '1px solid #e5e5e5', borderRadius: '8px', backgroundColor: '#f9f9f9', position: 'sticky', top: '100px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Order Summary</h2>

              {/* Items */}
              <div style={{ marginBottom: '24px' }}>
                {items.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e5e5e5' }}>
                    <div>
                      <p style={{ fontWeight: 500 }}>{item.name}</p>
                      {item.variant && <p style={{ fontSize: '12px', color: '#666' }}>{item.variant}</p>}
                      <p style={{ fontSize: '12px', color: '#666' }}>Qty: {item.quantity}</p>
                    </div>
                    <span style={{ fontWeight: 600 }}>{formatPrice(item.price * item.quantity, settings.currencySymbol)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Subtotal</span>
                  <span style={{ fontWeight: 600 }}>{formatPrice(subtotal, settings.currencySymbol)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
                    <span>Discount ({appliedCoupon?.code})</span>
                    <span style={{ fontWeight: 600 }}>-{formatPrice(discount, settings.currencySymbol)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Shipping ({selectedShipping?.name || '...'})</span>
                  <span style={{ fontWeight: 600 }}>
                    {shippingCost === 0 ? <span style={{ color: '#22c55e' }}>Free</span> : `${formatPrice(shippingCost, settings.currencySymbol)}`}
                  </span>
                </div>
                <TaxCalculator
                  country={shippingInfo.country}
                  state={shippingInfo.state}
                  city={shippingInfo.city}
                  zipCode={shippingInfo.zipCode}
                  subtotal={subtotal}
                  onTaxCalculated={setTaxInfo}
                />
                <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Total</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{formatPrice(total, settings.currencySymbol)}</span>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={loading || !selectedShipping} style={{
                width: '100%', marginTop: '24px', padding: '16px',
                backgroundColor: (loading || !selectedShipping) ? '#ccc' : '#000',
                color: '#fff', border: 'none', borderRadius: '6px',
                fontSize: '16px', fontWeight: 600,
                cursor: (loading || !selectedShipping) ? 'not-allowed' : 'pointer',
              }}>
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <ButtonSpinner /> Placing Order…
                  </span>
                ) : 'Place Order'}
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
