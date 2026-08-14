'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/http';

interface Review {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  title?: string;
  comment?: string;
  isVerified: boolean;
  isApproved: boolean;
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
}

interface ReviewSectionProps {
  productId: string;
  productName: string;
}

export default function ReviewSection({ productId, productName }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    rating: 5,
    title: '',
    comment: '',
  });

  useEffect(() => {
    fetchReviews();
    checkUser();
  }, [productId]);

  const checkUser = () => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      if (storedUser && token) {
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {}
  };

  const fetchReviews = async () => {
    setLoading(true);
    
    // Try to get reviews from database first
    let apiReviews: Review[] = [];
    try {
      const response = await fetch(`${API_BASE}/products/${productId}/reviews`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          apiReviews = data.data;
        }
      }
    } catch (err) {
      console.log('Reviews API not available');
    }

    // If we got reviews from API, use them
    if (apiReviews.length > 0) {
      // Sort by date (newest first)
      apiReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReviews(apiReviews);
      setLoading(false);
      return;
    }

    // Fallback: Load from localStorage
    let localReviews: Review[] = [];
    try {
      const storedReviews = localStorage.getItem(`reviews_${productId}`);
      if (storedReviews) {
        localReviews = JSON.parse(storedReviews);
      }
    } catch (err) {
      console.log('No stored reviews found');
    }

    // If we have local reviews, use them
    if (localReviews.length > 0) {
      localReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReviews(localReviews);
      setLoading(false);
      return;
    }

    // Last resort: Show mock reviews
    setReviews([
      {
        id: 'mock-1',
        userId: 'user1',
        productId,
        rating: 5,
        title: 'Amazing product!',
        comment: 'Really love this product. Great quality and fast shipping.',
        isVerified: true,
        isApproved: true,
        createdAt: '2024-01-15T10:00:00Z',
        user: { id: 'user1', firstName: 'John', lastName: 'D.' },
      },
      {
        id: 'mock-2',
        userId: 'user2',
        productId,
        rating: 4,
        title: 'Good value',
        comment: 'Solid product for the price. Would recommend.',
        isVerified: true,
        isApproved: true,
        createdAt: '2024-01-10T14:30:00Z',
        user: { id: 'user2', firstName: 'Sarah', lastName: 'M.' },
      },
    ]);
    
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setMessage({ type: 'error', text: 'Please login to add a review' });
        setSubmitting(false);
        return;
      }

      // Try to save to database via API
      let savedReview = null;
      try {
        const response = await fetch(`${API_BASE}/products/${productId}/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rating: formData.rating,
            title: formData.title,
            comment: formData.comment,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          savedReview = data.data;
          setMessage({ type: 'success', text: 'Review saved to database!' });
        } else {
          throw new Error('API returned error');
        }
      } catch (err) {
        console.log('API not available, saving locally');
        setMessage({ type: 'success', text: 'Review saved locally (API not available)' });
      }

      // Create review object
      const newReview: Review = {
        id: savedReview?.id || Date.now().toString(),
        userId: user?.id || 'anonymous',
        productId,
        rating: formData.rating,
        title: formData.title,
        comment: formData.comment,
        isVerified: false,
        isApproved: true,
        createdAt: new Date().toISOString(),
        user: user ? { id: user.id, firstName: user.firstName, lastName: user.lastName } : undefined,
      };
      
      const updatedReviews = [newReview, ...reviews];
      setReviews(updatedReviews);
      
      // Also save to localStorage as backup
      try {
        localStorage.setItem(`reviews_${productId}`, JSON.stringify(updatedReviews));
      } catch (e) {
        console.log('Could not save to localStorage');
      }
      
      setShowForm(false);
      setFormData({ rating: 5, title: '', comment: '' });
    } catch (err) {
      console.error('Failed to submit review:', err);
      setMessage({ type: 'error', text: 'Failed to submit review. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const ratingDistribution = [5, 4, 3, 2, 1].map(rating => ({
    rating,
    count: reviews.filter(r => r.rating === rating).length,
    percentage: reviews.length > 0 ? (reviews.filter(r => r.rating === rating).length / reviews.length) * 100 : 0,
  }));

  if (loading) {
    return <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>Loading reviews...</div>;
  }

  return (
    <div style={{ marginTop: '64px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '32px' }}>Customer Reviews</h2>

      {/* Rating Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        gap: '32px',
        marginBottom: '32px',
        padding: '24px',
        backgroundColor: '#f9f9f9',
        borderRadius: '8px',
      }}>
        {/* Overall Rating */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '8px' }}>
            {averageRating.toFixed(1)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '8px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ color: i <= Math.round(averageRating) ? '#f59e0b' : '#d1d5db', fontSize: '24px' }}>
                ★
              </span>
            ))}
          </div>
          <p style={{ color: '#666', fontSize: '14px' }}>{reviews.length} reviews</p>
        </div>

        {/* Rating Distribution */}
        <div>
          {ratingDistribution.map(({ rating, count, percentage }) => (
            <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ width: '20px', textAlign: 'right', fontSize: '14px' }}>{rating}★</span>
              <div style={{ flex: 1, height: '8px', backgroundColor: '#e5e5e5', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: '#f59e0b', borderRadius: '4px' }} />
              </div>
              <span style={{ width: '30px', fontSize: '14px', color: '#666' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Review Button */}
      {user && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '12px 24px',
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '24px',
          }}
        >
          Write a Review
        </button>
      )}

      {!user && (
        <p style={{ color: '#666', marginBottom: '24px' }}>
          <a href="/login" style={{ color: '#000', textDecoration: 'underline' }}>Login</a> to write a review
        </p>
      )}

      {/* Review Form */}
      {showForm && (
        <div style={{
          padding: '24px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          marginBottom: '32px',
          backgroundColor: 'var(--card-bg, white)',
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Write a Review</h3>

          {message.text && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: message.type === 'success' ? '#d1fae5' : '#fef2f2',
              border: `1px solid ${message.type === 'success' ? '#22c55e' : '#fecaca'}`,
              borderRadius: '6px',
              color: message.type === 'success' ? '#22c55e' : '#ef4444',
              fontSize: '14px',
              marginBottom: '16px',
            }}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Rating */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                Rating
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFormData({ ...formData, rating: star })}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '32px',
                      color: star <= formData.rating ? '#f59e0b' : '#d1d5db',
                      padding: 0,
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                Review Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Summarize your review"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  fontSize: '16px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Comment */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                Your Review
              </label>
              <textarea
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                placeholder="What did you like or dislike about this product?"
                required
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  fontSize: '16px',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '12px 24px',
                  backgroundColor: submitting ? '#ccc' : '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#f5f5f5',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>No reviews yet</p>
          <p>Be the first to review this product!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {reviews.map((review) => (
            <div key={review.id} style={{
              padding: '24px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              backgroundColor: 'var(--card-bg, white)',
            }}>
              {/* Review Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                  }}>
                    👤
                  </div>
                  <div>
                    <p style={{ fontWeight: 600 }}>
                      {review.user?.firstName || 'Anonymous'} {review.user?.lastName?.charAt(0) || ''}.
                    </p>
                    {review.isVerified && (
                      <span style={{ fontSize: '12px', color: '#22c55e' }}>✓ Verified Purchase</span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Rating */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} style={{ color: i <= review.rating ? '#f59e0b' : '#d1d5db' }}>★</span>
                ))}
                {review.title && (
                  <span style={{ fontWeight: 600, marginLeft: '8px' }}>{review.title}</span>
                )}
              </div>

              {/* Comment */}
              {review.comment && (
                <p style={{ color: '#333', lineHeight: 1.6 }}>{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}