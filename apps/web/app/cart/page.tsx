'use client';

import { useCart } from '@/lib/store';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

  const subtotal = getTotal();
  const shipping = subtotal >= 100 ? 0 : 9.99;
  const tax = subtotal * 0.1;
  const total = subtotal + shipping + tax;

  if (items.length === 0) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '100px 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '80px', marginBottom: '24px' }}>🛒</div>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '16px' }}>Your Cart is Empty</h1>
        <p style={{ fontSize: '18px', color: '#666', marginBottom: '32px' }}>
          Looks like you haven't added any items to your cart yet.
        </p>
        <Link href="/products" style={{
          display: 'inline-block',
          padding: '16px 32px',
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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Cart</span>
      </nav>

      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '32px' }}>
        Shopping Cart ({getItemCount()} items)
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '48px' }}>
        {/* Cart Items */}
        <div>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                gap: '24px',
                padding: '24px',
                marginBottom: '16px',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                backgroundColor: 'white',
              }}
            >
              {/* Product Image */}
              <div style={{
                width: '120px',
                height: '120px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
                flexShrink: 0,
              }}>
                {getCategoryEmoji(item.category)}
              </div>

              {/* Product Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Link href={`/products/${item.slug}`} style={{
                      textDecoration: 'none',
                      color: '#000',
                      fontSize: '18px',
                      fontWeight: 600,
                    }}>
                      {item.name}
                    </Link>
                    {item.variant && (
                      <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                        {item.variant}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '4px 8px',
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
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
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        backgroundColor: '#f5f5f5',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      -
                    </button>
                    <span style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 600 }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        backgroundColor: '#f5f5f5',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      +
                    </button>
                  </div>

                  {/* Price */}
                  <span style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Clear Cart */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
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
            padding: '32px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: '#f9f9f9',
            position: 'sticky',
            top: '100px',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Order Summary</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span style={{ fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Shipping</span>
                <span style={{ fontWeight: 600 }}>
                  {shipping === 0 ? (
                    <span style={{ color: '#22c55e' }}>Free</span>
                  ) : (
                    `$${shipping.toFixed(2)}`
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Tax</span>
                <span style={{ fontWeight: 600 }}>${tax.toFixed(2)}</span>
              </div>
              <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Total</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {shipping > 0 && (
              <p style={{ marginTop: '16px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                Add ${(100 - subtotal).toFixed(2)} more for free shipping
              </p>
            )}

            <button
              onClick={() => router.push('/checkout')}
              style={{
                width: '100%',
                marginTop: '24px',
                padding: '16px',
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

            <div style={{ marginTop: '24px', textAlign: 'center' }}>
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