// ---------------------------------------------------------------------------
// /cart - the shopping cart page.
//
// Renders the useCart() state (guest: localStorage, logged-in: mirrored
// to the server cart) with quantity controls, save-for-later, and a
// coupon box. "Proceed to checkout" navigates to /checkout, which does
// the actual order placement.
//
// The summary totals here (free shipping over $100, $9.99 below, flat
// 10% tax, free-shipping coupon) MIRROR the server fallbacks in
// order.routes.ts on purpose: the checkout page sends these same
// numbers back with the order, so cart and order always agree. (The
// server's own fallbacks are the last line of defence.)
//
// Note: useIsMobile is re-declared locally (a pre-existing duplicate of
// lib/hooks.ts) - left as-is to keep this diff comment-only.
// ---------------------------------------------------------------------------
'use client';

import { useState, useEffect } from 'react';
import { useCart } from '@/lib/store';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useRouter } from 'next/navigation';
import CouponInput from '@/components/CouponInput';
import { Coupon } from '@/lib/coupons';
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

function getCategoryEmoji(category: string): string {
  switch (category) {
    case 'Electronics': return '📱';
    case 'Clothing': return '👕';
    case 'Books': return '📚';
    case 'Digital Products': return '💻';
    default: return '📦';
  }
}

export default function CartView() {
  const { items, savedItems, removeItem, updateQuantity, clearCart, getTotal, getItemCount, saveForLater, moveToCart, removeSavedItem } = useCart();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { settings } = useStoreSettings();
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [discount, setDiscount] = useState(0);

  const subtotal = getTotal();
  // Digital cart branch: when every line is digital, the order
  // ships nothing and shipping is always free. We still apply the
  // free-shipping coupon (a no-op for digital) and the
  // free-over-$100 rule (also a no-op).
  const allDigital = items.length > 0 && items.every(
    (it) => it.type === 'digital',
  );
  const shipping = allDigital
    ? 0
    : (appliedCoupon?.type === 'free_shipping' ? 0 : (subtotal >= 100 ? 0 : 9.99));
  const tax = subtotal * 0.1;
  const total = subtotal - discount + shipping + tax;

  const handleApplyCoupon = (coupon: Coupon, discountAmount: number) => {
    setAppliedCoupon(coupon);
    setDiscount(discountAmount);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setDiscount(0);
  };

  if (items.length === 0 && savedItems.length === 0) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '64px 16px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '64px', marginBottom: '24px' }}>🛒</div>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>Your Cart is Empty</h1>
        <p style={{ fontSize: '16px', color: 'var(--muted, #666)', marginBottom: '32px' }}>
          Looks like you haven't added any items to your cart yet.
        </p>
        <Link href="/products" style={{
          display: 'inline-block',
          padding: '14px 28px',
          backgroundColor: 'var(--brand, #000)',
          color: 'var(--brand-text, #fff)',
          borderRadius: '6px',
          textDecoration: 'none',
          fontSize: '16px',
          fontWeight: 600,
        }}>
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '16px' : '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--muted, #666)' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--muted, #666)' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Cart</span>
      </nav>

      <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', marginBottom: '24px' }}>
        Shopping Cart ({getItemCount()} items)
      </h1>

      {/* Responsive layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 380px',
        gap: '32px',
        alignItems: 'start',
      }}>
        {/* Cart Items */}
        <div>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                gap: '16px',
                padding: '16px',
                marginBottom: '16px',
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: '8px',
                backgroundColor: 'var(--card-bg, white)',
              }}
            >
              {/* Product Image */}
              <div style={{
                width: isMobile ? '60px' : '80px',
                height: isMobile ? '60px' : '80px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isMobile ? '24px' : '32px',
                flexShrink: 0,
              }}>
                {getCategoryEmoji(item.category)}
              </div>

              {/* Product Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/products/${item.slug}`} style={{
                      textDecoration: 'none',
                      color: '#000',
                      fontSize: isMobile ? '14px' : '16px',
                      fontWeight: 600,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.name}
                    </Link>
                    {item.variant && (
                      <p style={{ fontSize: '13px', color: 'var(--muted, #666)', marginTop: '2px' }}>{item.variant}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '13px',
                      padding: '4px',
                      flexShrink: 0,
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  {/* Quantity Controls */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: '6px',
                    border: '1px solid var(--border, #e5e5e5)',
                    overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      style={{ padding: '6px 10px', border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer', fontSize: '14px' }}
                    >
                      -
                    </button>
                    <span style={{ padding: '6px 12px', fontSize: '14px', fontWeight: 600 }}>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      style={{ padding: '6px 10px', border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer', fontSize: '14px' }}
                    >
                      +
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Save for Later */}
                    <button
                      onClick={() => saveForLater(item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#3b82f6',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textDecoration: 'underline',
                      }}
                    >
                      Save for Later
                    </button>

                    {/* Price */}
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      {formatPrice(item.price * item.quantity, settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Clear Cart */}
          {items.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
              <Link href="/products" style={{
                textDecoration: 'none',
                color: '#000',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <DirectionArrow kind="back" /> Continue Shopping
              </Link>
              <button
                onClick={clearCart}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Clear Cart
              </button>
            </div>
          )}

          {/* Saved Items Section */}
          {savedItems.length > 0 && (
            <div style={{ marginTop: '32px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
                Saved for Later ({savedItems.length} items)
              </h2>
              {savedItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '16px',
                    marginBottom: '12px',
                    border: '1px solid var(--border, #e5e5e5)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--card-bg, white)',
                  }}
                >
                  <div style={{
                    width: '60px',
                    height: '60px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    flexShrink: 0,
                  }}>
                    {getCategoryEmoji(item.category)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/products/${item.slug}`} style={{
                      textDecoration: 'none',
                      color: '#000',
                      fontWeight: 600,
                      fontSize: '14px',
                    }}>
                      {item.name}
                    </Link>
                    <p style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>{formatPrice(item.price, settings.currencySymbol)}</p>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                      <button
                        onClick={() => moveToCart(item.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--brand, #000)',
                          color: 'var(--brand-text, #fff)',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Move to Cart
                      </button>
                      <button
                        onClick={() => removeSavedItem(item.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#fef2f2',
                          color: '#ef4444',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Summary */}
        {items.length > 0 && (
          <div>
            {/* "Instant delivery" notice for all-digital carts. The
                same callout is shown on the checkout success page;
                here it's a heads-up before the customer reaches
                checkout. */}
            {allDigital && (
              <div
                data-testid="instant-delivery-notice"
                style={{
                  padding: '12px 16px',
                  marginBottom: '12px',
                  border: '1px solid #a7f3d0',
                  borderRadius: '8px',
                  backgroundColor: '#ecfdf5',
                  color: '#065f46',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>⚡</span>
                <span>
                  <strong>Instant delivery.</strong>{' '}
                  Your download links will be sent to your email and available from
                  {' '}
                  <Link href="/account/downloads" style={{ color: '#065f46', textDecoration: 'underline' }}>
                    <DirectionArrow kind="forward" /> Account 
                  </Link>
                  {' '}right after purchase.
                </span>
              </div>
            )}
            <div style={{
              padding: '24px',
              border: '1px solid var(--border, #e5e5e5)',
              borderRadius: '8px',
              backgroundColor: '#f9f9f9',
              // The order summary is sticky on desktop so it follows
              // the user as they scroll a long cart. On mobile a sticky
              // summary in a 1fr grid would overlap the line items
              // above it on scroll, which is worse than no stickiness
              // at all - so the position is "static" below 768px and
              // becomes sticky from 768px up.
              position: isMobile ? 'static' : 'sticky',
              top: isMobile ? 'auto' : '80px',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>Order Summary</h2>

              {/* Coupon Input */}
              <div style={{ marginBottom: '20px' }}>
                <CouponInput
                  subtotal={subtotal}
                  onApply={handleApplyCoupon}
                  onRemove={handleRemoveCoupon}
                  appliedCoupon={appliedCoupon}
                />
              </div>

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
                  <span style={{ color: 'var(--muted, #666)' }}>Shipping</span>
                  <span style={{ fontWeight: 600 }}>
                    {shipping === 0 ? <span style={{ color: '#22c55e' }}>Free</span> : formatPrice(shipping, settings.currencySymbol)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Tax</span>
                  <span style={{ fontWeight: 600 }}>{formatPrice(tax, settings.currencySymbol)}</span>
                </div>

                <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Total</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{formatPrice(total, settings.currencySymbol)}</span>
                  </div>
                </div>
              </div>

              {shipping > 0 && !appliedCoupon && (
                <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted, #666)', textAlign: 'center' }}>
                  Add {formatPrice(100 - subtotal, settings.currencySymbol)} more for free shipping
                </p>
              )}

              {/* Digital-only cart: tax note. The tax rate is the
                  same for digital and physical in this build, but
                  calling it out is helpful when the customer is
                  surprised by an instant-delivery charge. */}
              {allDigital && (
                <p
                  data-testid="digital-shipping-note"
                  style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted, #666)', textAlign: 'center' }}
                >
                  📥 No shipping required — these items are digital downloads.
                </p>
              )}

              <button
                onClick={() => {
                  if (appliedCoupon) {
                    localStorage.setItem('appliedCoupon', JSON.stringify({
                      coupon: appliedCoupon,
                      discount: discount,
                    }));
                  } else {
                    localStorage.removeItem('appliedCoupon');
                  }
                  router.push('/checkout');
                }}
                style={{
                  width: '100%',
                  marginTop: '20px',
                  padding: '14px',
                  backgroundColor: 'var(--brand, #000)',
                  color: 'var(--brand-text, #fff)',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Proceed to Checkout
              </button>

              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--muted, #666)' }}>
                  🔒 Secure checkout
                </p>
                <p style={{ fontSize: '12px', color: 'var(--muted, #666)', marginTop: '4px' }}>
                  💳 We accept all major credit cards
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
