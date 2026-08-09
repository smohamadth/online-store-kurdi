'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, Product, getCategoryEmoji } from '@/lib/api';

interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product: Product;
}

export default function WishlistPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');

      if (!storedUser || !token) {
        router.push('/login');
        return;
      }

      setUser(JSON.parse(storedUser));
      fetchWishlist(token);
    } catch (err) {
      router.push('/login');
    }
  };

  const fetchWishlist = async (token: string) => {
    try {
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

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setWishlistItems(wishlistItems.filter(item => item.productId !== productId));
      }
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
        // Remove from wishlist
        setWishlistItems(wishlistItems.filter(item => item.productId !== productId));
        alert('Item moved to cart!');
      }
    } catch (err) {
      console.error('Failed to move to cart:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Loading wishlist...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Wishlist</span>
      </nav>

      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '32px' }}>
        My Wishlist ({wishlistItems.length} items)
      </h1>

      {wishlistItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '64px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>❤️</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
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
              <Link href={`/products/${item.product.slug}`}>
                <div style={{
                  aspectRatio: '1',
                  backgroundColor: '#f5f5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '64px',
                  textDecoration: 'none',
                }}>
                  {getCategoryEmoji(item.product.category?.name)}
                </div>
              </Link>

              {/* Product Info */}
              <div style={{ padding: '16px' }}>
                <Link href={`/products/${item.product.slug}`} style={{ textDecoration: 'none', color: '#000' }}>
                  <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>{item.product.name}</h3>
                </Link>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                  {item.product.category?.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>${item.product.price}</span>
                  {item.product.compareAtPrice && (
                    <span style={{ fontSize: '14px', color: '#666', textDecoration: 'line-through' }}>
                      ${item.product.compareAtPrice}
                    </span>
                  )}
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
