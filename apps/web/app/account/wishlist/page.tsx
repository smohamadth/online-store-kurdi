'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCategoryEmoji } from '@/lib/api';

interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product: any;
}

export default function WishlistPage() {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWishlist();
  }, []);

  const fetchWishlist = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist`, {
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

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist/${productId}`, {
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

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist/move-to-cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId, quantity: 1 }),
      });

      if (response.ok) {
        setWishlistItems(wishlistItems.filter(item => item.productId !== productId));
        alert('Item moved to cart!');
      }
    } catch (err) {
      console.error('Failed to move to cart:', err);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px', color: '#666' }}>Loading wishlist...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
        My Wishlist ({wishlistItems.length} items)
      </h1>

      {wishlistItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '64px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❤️</div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Your wishlist is empty</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>
            Save items you love to your wishlist
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          {wishlistItems.map((item) => (
            <div
              key={item.id}
              style={{
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: 'white',
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
                  <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>{item.product?.name || 'Product'}</h3>
                </Link>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                  {item.product?.category?.name || ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>${item.product?.price || 0}</span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => moveToCart(item.productId)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    Add to Cart
                  </button>
                  <button
                    onClick={() => removeFromWishlist(item.productId)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#f5f5f5',
                      border: 'none',
                      borderRadius: '4px',
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
