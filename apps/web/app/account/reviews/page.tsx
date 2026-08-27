'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE } from '@/lib/http';

// Inlined until `lib/types.ts` is committed; the canonical
// `ReviewPhoto` interface there is the source of truth.
interface ReviewPhoto {
  id: string;
  url: string;
  thumbnail: string | null;
  sortOrder: number;
}

interface MyReview {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  rating: number;
  title?: string;
  comment?: string;
  isVerified: boolean;
  isApproved: boolean;
  photos: ReviewPhoto[];
  createdAt: string;
}

export default function MyReviewsPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<MyReview[]>([]);
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

      fetchReviews(token);
    } catch (err) {
      console.error('Auth check error:', err);
      router.push('/login');
    }
  };

  const fetchReviews = async (token: string) => {
    try {
      const response = await fetch(`${API_BASE}/users/me/reviews`, {
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

      await fetch(`${API_BASE}/reviews/${reviewId}`, {
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
      <div style={{ textAlign: 'center', padding: '64px 20px' }}>
        <p style={{ color: 'var(--muted, #666)' }}>Loading reviews...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '32px' }}>
        My Reviews
      </h1>

          {reviews.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '64px',
              border: '1px solid var(--border, #e5e5e5)',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⭐</div>
              <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No reviews yet</h2>
              <p style={{ color: 'var(--muted, #666)', marginBottom: '24px' }}>
                Share your thoughts on products you've purchased
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {reviews.map((review) => (
                <div key={review.id} data-testid="my-review-card" style={{
                  padding: '24px',
                  border: '1px solid var(--border, #e5e5e5)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--card-bg, white)',
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
                      <p style={{ fontSize: '12px', color: 'var(--muted, #666)', marginTop: '4px' }}>
                        {new Date(review.createdAt).toLocaleDateString()}
                        {' · '}
                        {review.isApproved ? 'Published' : 'Awaiting moderation'}
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
                      <span style={{ fontWeight: 600, marginInlineStart: '8px' }}>{review.title}</span>
                    )}
                    {/* Surface the verified-purchaser badge here too
                        so the user can see the trust signal carried
                        alongside their own review. */}
                    {review.isVerified && (
                      <span
                        data-testid="my-review-verified"
                        style={{
                          marginInlineStart: '8px',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: '#ecfdf5',
                          color: 'var(--success, #047857)',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        ✓ Verified Purchaser
                      </span>
                    )}
                  </div>

                  {/* Comment */}
                  {review.comment && (
                    <p style={{ color: '#555', lineHeight: 1.6 }}>{review.comment}</p>
                  )}

                  {/* Photos (read-only here; the PDP is where the
                      lightbox lives, but each thumb is still a
                      link to its full image in a new tab so a
                      customer can revisit their own shots). */}
                  {review.photos && review.photos.length > 0 && (
                    <div
                      data-testid="my-review-photos"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                        gap: '8px',
                        marginTop: '12px',
                      }}
                    >
                      {review.photos.map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="my-review-photo"
                          style={{
                            display: 'block',
                            aspectRatio: '1',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            backgroundColor: '#f5f5f5',
                          }}
                        >
                          <img
                            src={photo.thumbnail || photo.url}
                            alt="Review photo"
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
    </div>
  );
}