'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Review {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  rating: number;
  title?: string;
  comment?: string;
  createdAt: string;
}

export default function MyReviewsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
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

      let userData;
      try {
        userData = JSON.parse(storedUser);
      } catch (e) {
        router.push('/login');
        return;
      }

      setUser(userData);
      fetchReviews(token);
    } catch (err) {
      console.error('Auth check error:', err);
      router.push('/login');
    }
  };

  const fetchReviews = async (token: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/users/me/reviews`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setReviews(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      setReviews(reviews.filter(r => r.id !== reviewId));
    } catch (err) {
      console.error('Failed to delete review:', err);
      // Remove locally for demo
      setReviews(reviews.filter(r => r.id !== reviewId));
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Loading reviews...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <Link href="/account" style={{ textDecoration: 'none', color: '#666' }}>Account</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>My Reviews</span>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '48px' }}>
        {/* Sidebar */}
        <div>
          <div style={{
            padding: '24px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: 'white',
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#f5f5f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              margin: '0 auto 12px',
            }}>
              👤
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', textAlign: 'center', marginBottom: '16px' }}>
              {user?.firstName} {user?.lastName}
            </h2>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link href="/account" style={{
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Dashboard
              </Link>
              <Link href="/account/orders" style={{
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Orders
              </Link>
              <Link href="/account/reviews" style={{
                padding: '10px 16px',
                backgroundColor: '#f5f5f5',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#000',
                fontWeight: 500,
              }}>
                Reviews
              </Link>
              <Link href="/account/profile" style={{
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Edit Profile
              </Link>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '32px' }}>
            My Reviews
          </h1>

          {reviews.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '64px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⭐</div>
              <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No reviews yet</h2>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                Share your thoughts on products you've purchased
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {reviews.map((review) => (
                <div key={review.id} style={{
                  padding: '24px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <Link href={`/products/${review.productSlug}`} style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#000',
                        textDecoration: 'none',
                      }}>
                        {review.productName}
                      </Link>
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        {new Date(review.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteReview(review.id)}
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
                      Delete
                    </button>
                  </div>

                  {/* Rating */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} style={{ color: i <= review.rating ? '#f59e0b' : '#d1d5db' }}>★</span>
                    ))}
                    {review.title && (
                      <span style={{ fontWeight: 600, marginLeft: '8px' }}>{review.title}</span>
                    )}
                  </div>

                  {/* Comment */}
                  {review.comment && (
                    <p style={{ color: '#555', lineHeight: 1.6 }}>{review.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}