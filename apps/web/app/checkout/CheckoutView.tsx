// ---------------------------------------------------------------------------
// /checkout - the order-placement page (also the Stripe return landing).
//
// Flow: login check -> fill shipping (prefilled from the profile) ->
// pick shipping method (ShippingSelector) and tax (TaxCalculator) ->
// pick payment (cod / bank_transfer / card) -> POST /api/orders.
//
// The server is the source of truth: the success screen only renders
// after the API returns a real orderNumber (the inline comment above
// handleSubmit records the old fake-success bug). Card orders redirect
// to the Stripe Checkout session URL and come back on
// ?paid=true/?canceled=true, where returnState renders the status
// banner instead of the (now empty) cart.
//
// The submitted amounts (subtotal/shipping/tax/total) are computed HERE
// - with the same fallback rules as CartView and the API - and sent in
// the order body.
// ---------------------------------------------------------------------------
'use client';

import { ButtonSpinner } from '@/components/Spinner';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/store';
import { api } from '@/lib/api';
import { authHttp } from '@/lib/http';
import ShippingSelector from '@/components/ShippingSelector';
import TaxCalculator from '@/components/TaxCalculator';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { readStoredUser } from '@/lib/storedUser';

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
  const [orderError, setOrderError] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderId, setOrderId] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [discount, setDiscount] = useState(0);
  // Wallet credit: store-credit toggle + gift-card code. The SERVER is
  // the source of truth (it re-validates and debits atomically); these
  // states only drive the estimate shown in the summary and the payload.
  const [useStoreCredit, setUseStoreCredit] = useState(false);
  const [storeCreditBalance, setStoreCreditBalance] = useState<number | null>(null);
  const [giftCardCode, setGiftCardCode] = useState('');
  const [giftCardInfo, setGiftCardInfo] = useState<{
    code: string;
    availableBalance: number;
    currency: string;
  } | null>(null);
  const [giftCardError, setGiftCardError] = useState('');
  const [walletError, setWalletError] = useState('');

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
  const [paymentMethod, setPaymentMethod] = useState('cod');
  // Stripe Checkout sends the customer back to /checkout?paid=true
  // (or ?canceled=true). The order already exists by then, so the
  // empty-cart redirect below must not fire and the customer needs
  // an honest status instead of a blank page.
  const [returnState, setReturnState] = useState<'paid' | 'canceled' | null>(null);
  // Gateway (Zarinpal / IDPay / PayPal / FIB / ZainCash) return: the order is
  // verified server-side when the customer comes back. Holds the verification
  // outcome + gateway message for a banner.
  const [gatewayReturn, setGatewayReturn] = useState<{ status: 'paid' | 'canceled'; message?: string } | null>(null);

  const subtotal = getTotal();
  // Physical cart totals for weight- and item_count-based shipping.
  // Digital items carry no weight and don't add to the item count.
  const physicalItems = items.filter((i) => i.type !== 'digital');
  const itemCount = physicalItems.reduce((n, i) => n + (i.quantity || 1), 0);
  const totalWeight = physicalItems.reduce((n, i) => n + ((i.weight || 0) * (i.quantity || 1)), 0);
  const shippingCost = selectedShipping?.isFree ? 0 : (selectedShipping?.rate || 0);
  const taxAmount = taxInfo?.taxAmount || subtotal * 0.1;
  const total = subtotal - discount + shippingCost + taxAmount;

  // Wallet estimate: what the store credit + gift card will cover
  // (client-side preview; the server debits are authoritative and may
  // apply less, e.g. if the balance changed since this was rendered).
  const creditBalance = storeCreditBalance ?? 0;
  const giftBalance = giftCardInfo?.availableBalance ?? 0;
  const walletApplied = Math.min(
    total,
    (useStoreCredit ? creditBalance : 0) + giftBalance
  );
  const amountDue = Math.max(0, Math.round((total - walletApplied) * 100) / 100);
  // Online gateways can't be mixed with a PARTIAL wallet payment (the
  // API refuses it); the UI blocks it too so the customer finds out
  // before clicking Place Order.
  const gatewayMethod = paymentMethod !== 'cod' && paymentMethod !== 'bank_transfer';
  const walletMixBlocked = gatewayMethod && walletApplied > 0.005 && amountDue > 0.005;

  useEffect(() => {
    // Check if user is logged in
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (storedUser && token) {
      // Safe read: corrupt/foreign localStorage must not crash checkout.
      const userData = readStoredUser();
      if (userData) {
        setUser(userData);
        setShippingInfo(prev => ({
          ...prev,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
        }));
      }
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

    // Load the customer's store-credit balance (0 / null when they have
    // none, or the endpoint is unreachable - checkout must never break
    // because the wallet is down).
    const token = localStorage.getItem('token');
    if (token) {
      authHttp
        .get<any>('/store-credit')
        .then((res) => {
          const b = Number(res?.data?.balance);
          if (Number.isFinite(b)) setStoreCreditBalance(b);
        })
        .catch(() => {});
    }

    // Redirect if cart is empty
    // A customer returning from Stripe Checkout has an empty cart by
    // design (it was cleared when the order was placed) - don't
    // bounce them to /cart before the return banner has a chance.
    if (items.length === 0 && !orderPlaced && !returnState) {
      router.push('/cart');
    }
  }, [items, orderPlaced, returnState, router]);

  // Validate a gift-card code against the API before the order is
  // placed. This only confirms the code + balance; the actual debit
  // happens server-side at order placement (never here).
  const checkGiftCard = async () => {
    const code = giftCardCode.trim();
    if (!code) return;
    setGiftCardError('');
    setGiftCardInfo(null);
    try {
      const res = await authHttp.post<any>(
        `/gift-cards/${encodeURIComponent(code)}/redeem`
      );
      setGiftCardInfo({
        code: String(res?.data?.code || code).toUpperCase(),
        availableBalance: Number(res?.data?.availableBalance) || 0,
        currency: String(res?.data?.currency || 'USD'),
      });
    } catch (err: any) {
      setGiftCardError(err?.message || 'Gift card is not valid');
    }
  };

  // Stripe Checkout redirects back to /checkout?paid=true / ?canceled=true.
  // Read the flag once on mount; the order already exists either way.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paid') === 'true') {
      setReturnState('paid');
      return;
    }
    if (params.get('canceled') === 'true') {
      setReturnState('canceled');
      return;
    }

    // Hosted gateway (Zarinpal / IDPay / PayPal / FIB / ZainCash) return:
    // the gateway redirected here with ?gateway=<id>&order=<orderId> plus its
    // own params. Ask the server to verify the payment server-to-server.
    const gateway = params.get('gateway');
    const order = params.get('order');
    if (gateway && order) {
      const callbackParams: Record<string, string> = {};
      params.forEach((value, key) => {
        if (key !== 'gateway' && key !== 'order') callbackParams[key] = value;
      });
      authHttp
        .post<{ success: boolean; message?: string }>(`/payments/gateways/${gateway}/verify`, {
          orderId: order,
          callbackParams,
        })
        .then((res) => {
          const ok = res?.data?.success === true;
          setGatewayReturn({ status: ok ? 'paid' : 'canceled', message: res?.data?.message });
        })
        .catch(() => setGatewayReturn({ status: 'canceled' }));
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setShippingInfo({ ...shippingInfo, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError('');
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
        // Wallet credit: the server re-validates the code, redeemability,
        // currency and balance, then debits atomically. Sending the raw
        // code is safe — a checked (validated) card is only a nicer UX.
        applyStoreCredit: useStoreCredit,
        giftCardCode: giftCardCode.trim() || undefined,
      };

      // An order is only real once the SERVER has stored it.
      //
      // This used to catch every failure, invent an 'ORD-<timestamp>' number,
      // write the order to localStorage, clear the cart and show the success
      // screen. A customer whose order was rejected (out of stock, expired
      // coupon, payment declined, API down) was told it succeeded, while the
      // store never received the order and the cart was already emptied.
      const response = await api.createOrder(token, orderData);
      const confirmed = response?.data?.orderNumber;
      const confirmedId = response?.data?.id;

      if (!confirmed) {
        throw new Error('The server did not confirm the order. Please try again.');
      }

      // Hosted gateway payment: the API created a payment session at the
      // chosen gateway (Stripe Checkout, PayPal, Zarinpal, IDPay, ZainCash,
      // FIB) and returned a checkoutUrl. Hand the customer over to the
      // gateway's hosted page; the return-verify / webhook settles the order.
      // The cart is cleared now - the order is already real.
      const checkoutUrl = response?.data?.checkoutUrl;
      if (checkoutUrl) {
        setOrderNumber(confirmed);
        clearCart();
        localStorage.removeItem('appliedCoupon');
        window.location.replace(checkoutUrl);
        return;
      }

      setOrderNumber(confirmed);
      if (confirmedId) setOrderId(confirmedId);
      setOrderPlaced(true);
      clearCart();
      localStorage.removeItem('appliedCoupon');
    } catch (err: any) {
      // Keep the cart intact so the customer can correct the problem and retry.
      console.error('Order failed:', err);
      setOrderError(
        err?.message || 'We could not place your order. Your cart has not been changed.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  // Order confirmation
  if (orderPlaced) {
    return (
      <div style={{ maxWidth: '600px', margin: '64px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ padding: '48px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '8px', backgroundColor: 'white' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>✅</div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
            Order Placed Successfully!
          </h1>
          <p style={{ color: 'var(--muted, #666)', marginBottom: '8px' }}>Thank you for your purchase</p>
          <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>
            Order #{orderNumber}
          </p>
          {/* Receipt downloads - the orderId is the receipt route param.
              We fall back to /account/orders if the orderId somehow
              wasn't captured. */}
          {orderId && (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }} data-testid="receipt-actions">
              <a
                href={`/api/orders/${orderId}/receipt`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                📄 View receipt
              </a>
              <a
                href={`/api/orders/${orderId}/receipt.pdf`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f5f5f5',
                  color: '#000',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                ⬇ Download PDF
              </a>
            </div>
          )}

          {/* Order Summary */}
          <div style={{ padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '24px', textAlign: 'start' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Order Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted, #666)' }}>Subtotal</span>
                <span>{formatPrice(subtotal, settings.currencySymbol)}</span>
              </div>
              {discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
                  <span>Discount ({appliedCoupon?.code})</span>
                  <span>-{formatPrice(discount, settings.currencySymbol)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted, #666)' }}>Shipping ({selectedShipping?.name || 'Standard'})</span>
                <span>{shippingCost === 0 ? 'Free' : `${formatPrice(shippingCost, settings.currencySymbol)}`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted, #666)' }}>Tax</span>
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
            <p style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>
              Confirmation email sent to {shippingInfo.email}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <Link href="/account/orders" style={{ padding: '12px 24px', backgroundColor: 'var(--brand, #000)', color: 'var(--brand-text, #fff)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
              View Orders
            </Link>
            <Link href="/products" style={{ padding: '12px 24px', backgroundColor: 'var(--card-bg, white)', color: '#000', border: '1px solid #000', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
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
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--muted, #666)' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--muted, #666)' }}>Home</Link>
        <span>/</span>
        <Link href="/cart" style={{ textDecoration: 'none', color: 'var(--muted, #666)' }}>Cart</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Checkout</span>
      </nav>

      <h1 style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: 'bold', marginBottom: '32px' }}>Checkout</h1>

      {returnState === 'paid' && (
        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', marginBottom: '24px', fontSize: '14px' }}>
          ✅ Payment received — we're confirming your order. Your confirmation email follows once the payment settles. <Link href="/account/orders" style={{ fontWeight: 600 }}>View your orders</Link>
        </div>
      )}
      {returnState === 'canceled' && (
        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: '24px', fontSize: '14px' }}>
          ⚠️ Your card payment was not completed. The order is still pending — the store will contact you, or you can retry from <Link href="/account/orders" style={{ fontWeight: 600 }}>your orders</Link>.
        </div>
      )}
      {gatewayReturn?.status === 'paid' && (
        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', marginBottom: '24px', fontSize: '14px' }}>
          ✅ Payment confirmed{gatewayReturn.message ? ` — ${gatewayReturn.message}` : ''}. Your order is being processed. <Link href="/account/orders" style={{ fontWeight: 600 }}>View your orders</Link>
        </div>
      )}
      {gatewayReturn?.status === 'canceled' && (
        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: '24px', fontSize: '14px' }}>
          ⚠️ Your payment was not completed{gatewayReturn.message ? ` (${gatewayReturn.message})` : ''}. The order is still pending — you can retry from <Link href="/account/orders" style={{ fontWeight: 600 }}>your orders</Link>.
        </div>
      )}

      {orderError && (
        <div
          role="alert"
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            borderRadius: '8px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            fontSize: '14px',
            lineHeight: 1.6,
          }}
        >
          <strong>Your order was not placed.</strong> {orderError}
          <div style={{ marginTop: '4px', color: '#7f1d1d' }}>
            Nothing has been charged and your cart is unchanged.
          </div>
        </div>
      )}

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
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Last Name *</label>
                  <input type="text" name="lastName" value={shippingInfo.lastName} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Email *</label>
                  <input type="email" name="email" value={shippingInfo.email} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Phone</label>
                  <input type="tel" name="phone" value={shippingInfo.phone} onChange={handleChange}
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Address *</label>
                <input type="text" name="address" value={shippingInfo.address} onChange={handleChange} placeholder="123 Main St" required
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>City *</label>
                  <input type="text" name="city" value={shippingInfo.city} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>State *</label>
                  <input type="text" name="state" value={shippingInfo.state} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>ZIP Code *</label>
                  <input type="text" name="zipCode" value={shippingInfo.zipCode} onChange={handleChange} required
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '16px', outline: 'none' }} />
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
                itemCount={itemCount}
                weight={totalWeight}
                onSelect={setSelectedShipping}
                selectedMethodId={selectedShipping?.id}
              />
            </div>

            {/* Payment Method */}
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Payment Method</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { id: 'cod', label: 'Cash on Delivery', icon: '💵' },
                  { id: 'bank_transfer', label: 'Bank Transfer', icon: '🏦' },
                  // Hosted gateways the admin enabled (from /api/settings'
                  // secret-free paymentGateways list). A gateway only shows
                  // when its credentials are filled in - a store without keys
                  // never offers an option it cannot collect.
                  ...(settings.paymentGateways || [])
                    .filter((g) => g.enabled)
                    .map((g) => ({
                      id: g.id,
                      label: g.label,
                      icon: g.country === 'IR' ? '🕌' : g.country === 'IQ' ? '💠' : '💳',
                    })),
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

            {/* Wallet credit (store credit + gift card) */}
            <div style={{ marginTop: '40px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Wallet Credit</h2>

              {walletMixBlocked && (
                <div style={{ padding: '12px 16px', borderRadius: '6px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', fontSize: '14px', marginBottom: '16px' }}>
                  Online card payment can't be combined with a partial wallet credit.
                  Cover the whole order with credit, or choose Cash on Delivery /
                  Bank Transfer for the remaining balance.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', cursor: gatewayMethod ? 'not-allowed' : 'pointer', opacity: gatewayMethod ? 0.6 : 1 }}>
                  <input
                    type="checkbox"
                    checked={useStoreCredit}
                    disabled={gatewayMethod}
                    onChange={(e) => setUseStoreCredit(e.target.checked)}
                  />
                  <span style={{ fontWeight: 500 }}>
                    Use my store credit
                    {storeCreditBalance !== null && (
                      <span style={{ color: 'var(--muted, #666)', fontWeight: 400 }}>
                        {' '}— balance {formatPrice(storeCreditBalance, settings.currencySymbol)}
                      </span>
                    )}
                  </span>
                </label>

                <div style={{ padding: '16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Gift card code"
                      value={giftCardCode}
                      disabled={gatewayMethod}
                      onChange={(e) => {
                        setGiftCardCode(e.target.value);
                        setGiftCardInfo(null);
                        setGiftCardError('');
                      }}
                      style={{ flex: 1, padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '6px', fontSize: '14px', outline: 'none' }}
                    />
                    <button
                      type="button"
                      disabled={gatewayMethod || !giftCardCode.trim()}
                      onClick={checkGiftCard}
                      style={{ padding: '12px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#000', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
                    >
                      Check
                    </button>
                  </div>
                  {giftCardError && (
                    <p style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>{giftCardError}</p>
                  )}
                  {giftCardInfo && !giftCardError && (
                    <p style={{ color: '#16a34a', fontSize: '13px', marginTop: '8px' }}>
                      ✓ {giftCardInfo.code} — {formatPrice(giftCardInfo.availableBalance, giftCardInfo.currency)} available
                    </p>
                  )}
                  {!giftCardInfo && !giftCardError && (
                    <p style={{ color: 'var(--muted, #666)', fontSize: '12px', marginTop: '8px' }}>
                      Enter the code and press Check to confirm it before placing the order.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div>
            <div style={{ padding: '32px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '8px', backgroundColor: '#f9f9f9', // On mobile a sticky summary in a 1fr grid would overlap
              // the form fields above it on scroll. Static below 768px.
              position: isMobile ? 'static' : 'sticky', top: isMobile ? 'auto' : '100px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Order Summary</h2>

              {/* Items */}
              <div style={{ marginBottom: '24px' }}>
                {items.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e5e5e5' }}>
                    <div>
                      <p style={{ fontWeight: 500 }}>{item.name}</p>
                      {item.variant && <p style={{ fontSize: '12px', color: 'var(--muted, #666)' }}>{item.variant}</p>}
                      <p style={{ fontSize: '12px', color: 'var(--muted, #666)' }}>Qty: {item.quantity}</p>
                    </div>
                    <span style={{ fontWeight: 600 }}>{formatPrice(item.price * item.quantity, settings.currencySymbol)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Subtotal</span>
                  <span style={{ fontWeight: 600 }}>{formatPrice(subtotal, settings.currencySymbol)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
                    <span>Discount ({appliedCoupon?.code})</span>
                    <span style={{ fontWeight: 600 }}>-{formatPrice(discount, settings.currencySymbol)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Shipping ({selectedShipping?.name || '...'})</span>
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
                {useStoreCredit && storeCreditBalance !== null && walletApplied > 0.005 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                    <span>Store credit</span>
                    <span style={{ fontWeight: 600 }}>
                      -{formatPrice(Math.min(creditBalance, walletApplied), settings.currencySymbol)}
                    </span>
                  </div>
                )}
                {giftCardInfo && giftBalance > 0.005 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                    <span>Gift card ({giftCardInfo.code})</span>
                    <span style={{ fontWeight: 600 }}>
                      -{formatPrice(Math.min(giftBalance, Math.max(0, walletApplied - (useStoreCredit ? creditBalance : 0))), settings.currencySymbol)}
                    </span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      {walletApplied > 0.005 ? 'Amount due' : 'Total'}
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{formatPrice(amountDue, settings.currencySymbol)}</span>
                  </div>
                  {walletApplied > 0.005 && (
                    <p style={{ fontSize: '12px', color: 'var(--muted, #666)', marginTop: '4px' }}>
                      {formatPrice(walletApplied, settings.currencySymbol)} covered by wallet credit
                    </p>
                  )}
                </div>
              </div>

              <button type="submit" disabled={loading || !selectedShipping || walletMixBlocked} style={{
                width: '100%', marginTop: '24px', padding: '16px',
                backgroundColor: (loading || !selectedShipping || walletMixBlocked) ? '#ccc' : '#000',
                color: '#fff', border: 'none', borderRadius: '6px',
                fontSize: '16px', fontWeight: 600,
                cursor: (loading || !selectedShipping || walletMixBlocked) ? 'not-allowed' : 'pointer',
              }}>
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <ButtonSpinner /> Placing Order…
                  </span>
                ) : walletMixBlocked ? 'Choose another payment method' : 'Place Order'}
              </button>

              <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--muted, #666)', textAlign: 'center' }}>
                🔒 Secure checkout
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
