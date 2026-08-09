'use client';

import { useState } from 'react';
import { useCart } from '@/lib/store';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CouponInput from '@/components/CouponInput';
import { Coupon } from '@/lib/coupons';

function getCategoryEmoji(category: string): string {
  switch (category) {
    case 'Electronics': return '📱';
    case 'Clothing': return '👕';
    case 'Books': return '📚';
    case 'Digital Products': return '💻';
    default: return '📦';
  }
}

export default function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, getTotal, getItemCount } = useCart();
  const router = useRouter();
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [discount, setDiscount] = useState(0);

  const subtotal = getTotal();
  const shipping = appliedCoupon?.type === 'free_shipping' ? 0 : (subtotal >= 100 ? 0 : 9.99);
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

  if (items.length === 0) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '64px 16px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '64px', marginBottom: '24px' }}>🛒</div>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>Your Cart is Empty</h1>
        <p style={{ fontSize: '16px', color: '#666', marginBottom: '32px' }}>
          Looks like you haven't added any items to your cart yet.
        </p>
        <Link href="/products" style={{
          display: 'inline-block',
          padding: '14px 28px',
          backgroundColor: '#000',
          color: '#fff',
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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Cart</span>
      </nav>

      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
        Shopping Cart ({getItemCount()} items)
      </h1>

      {/* Responsive layout */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '32px' 
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
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                backgroundColor: 'white',
              }}
            >
              {/* Product Image */}
              <div style={{
                width: '80px',
                height: '80px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
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
                      fontSize: '16px',
                      fontWeight: 600,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.name}
                    </Link>
                    {item.variant && (
                      <p style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{item.variant}</p>
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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  {/* Quantity Controls */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: '6px',
                    border: '1px solid #e5e5e5',
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

                  {/* Price */}
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Clear Cart */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
            <Link href="/products" style={{
              textDecoration: 'none',
              color: '#000',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              ← Continue Shopping
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
        </div>

        {/* Order Summary */}
        <div>
          <div style={{
            padding: '24px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: '#f9f9f9',
            position: 'sticky',
            top: '80px',
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

            {shipping > 0 && !appliedCoupon && (
              <p style={{ marginTop: '12px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                Add ${(100 - subtotal).toFixed(2)} more for free shipping
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
                backgroundColor: '#000',
                color: '#fff',
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
              <p style={{ fontSize: '12px', color: '#666' }}>
                🔒 Secure checkout
              </p>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                💳 We accept all major credit cards
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
