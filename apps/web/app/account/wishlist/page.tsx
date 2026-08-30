// /account/wishlist - the saved-items list. Each row offers
// "move to cart" (POST /api/wishlist/move-to-cart - server creates
// the cart row and drops the wishlist row) and remove.
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCategoryEmoji } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { API_BASE } from '@/lib/http';

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

interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product: any;
}

export default function WishlistPage() {
  const isMobile = useIsMobile();
  const { settings } = useStoreSettings();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWishlist();
  }, []);

  const fetchWishlist = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/wishlist`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setWishlistItems(data.data || []);
      }
    } catch (err) {
      console.log('Wishlist API not available');
    } finally {
      setLoading(false);
    }
  };

  const removeFromWishlist = async (productId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch(`${API_BASE}/wishlist/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      setWishlistItems(wishlistItems.filter(item => item.productId !== productId));
    } catch (err) {
      console.error('Failed to remove from wishlist:', err);
    }
  };

  const moveToCart = async (productId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/wishlist/move-to-cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId, quantity: 1 }),
      });

      if (response.ok) {
        setWishlistItems(wishlistItems.filter(item => item.productId !== productId));
      }
    } catch (err) {
      console.error('Failed to move to cart:', err);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px', color: 'var(--muted, #666)' }}>Loading wishlist...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', marginBottom: '24px' }}>
        My Wishlist ({wishlistItems.length} items)
      </h1>

      {wishlistItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '64px',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❤️</div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Your wishlist is empty</h2>
          <p style={{ color: 'var(--muted, #666)', marginBottom: '24px' }}>
            Save items you love to your wishlist
          </p>
          <Link href="/products" style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: 'var(--brand, #000)',
            color: 'var(--brand-text, #fff)',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
          }}>
            Browse Products
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
          {wishlistItems.map((item) => (
            <div
              key={item.id}
              style={{
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: 'var(--card-bg, white)',
              }}
            >
              {/* Product Image */}
              <Link href={`/products/${item.product?.slug || '#'}`}>
                <div style={{
                  aspectRatio: '1',
                  backgroundColor: '#f5f5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '48px',
                  textDecoration: 'none',
                  color: '#000',
                }}>
                  {getCategoryEmoji(item.product?.category?.name)}
                </div>
              </Link>

              {/* Product Info */}
              <div style={{ padding: '16px' }}>
                <Link href={`/products/${item.product?.slug || '#'}`} style={{ textDecoration: 'none', color: '#000' }}>
                  <h3 style={{ fontWeight: 600, marginBottom: '8px', fontSize: '15px' }}>{item.product?.name || 'Product'}</h3>
                </Link>
                <p style={{ fontSize: '13px', color: 'var(--muted, #666)', marginBottom: '8px' }}>
                  {item.product?.category?.name || ''}
                </p>
                <span style={{ fontSize: '18px', fontWeight: 'bold', display: 'block', marginBottom: '12px' }}>
                  {formatPrice(item.product?.price || 0, settings.currencySymbol)}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => moveToCart(item.productId)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: 'var(--brand, #000)',
                      color: 'var(--brand-text, #fff)',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    Add to Cart
                  </button>
                  <button
                    onClick={() => removeFromWishlist(item.productId)}
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#f5f5f5',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
