'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { API_BASE } from '@/lib/http';

interface Review {
  id: string;
  userId: string;
  productId: string;
  productName?: string;
  productSlug?: string;
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
  };
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending'>('all');
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // One request for the whole moderation queue. This previously fetched all
      // products and then issued a request per product (N+1), which also missed
      // any product beyond the first page.
      const response = await fetch(`${API_BASE}/reviews?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const mapped: Review[] = (data.data || []).map((r: any) => ({
          ...r,
          productName: r.product?.name || 'Unknown product',
          productSlug: r.product?.slug || '',
          userName: r.user ? `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim() : 'Anonymous',
        }));
        setReviews(mapped);
        setApiStatus('connected');
        return;
      }

      setApiStatus('disconnected');
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
      setApiStatus('disconnected');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (reviewId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const res = await fetch(`${API_BASE}/reviews/${reviewId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isApproved: true }),
        });
        if (!res.ok) throw new Error('Approve failed');
      }

      setReviews(reviews.map(r => r.id === reviewId ? { ...r, isApproved: true } : r));
    } catch (err) {
      console.error('Failed to approve review:', err);
    }
  };

  const handleReject = async (reviewId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const res = await fetch(`${API_BASE}/reviews/${reviewId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isApproved: false }),
        });
        if (!res.ok) throw new Error('Reject failed');
      }

      setReviews(reviews.map(r => r.id === reviewId ? { ...r, isApproved: false } : r));
    } catch (err) {
      console.error('Failed to reject review:', err);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;

    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${API_BASE}/reviews/${reviewId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // Remove locally
      setReviews(reviews.filter(r => r.id !== reviewId));
    } catch (err) {
      console.error('Failed to delete review:', err);
    }
  };

  const filteredReviews = filter === 'all' 
    ? reviews 
    : filter === 'approved' 
      ? reviews.filter(r => r.isApproved)
      : reviews.filter(r => !r.isApproved);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <p style={{ color: '#666' }}>Loading reviews...</p>
      </div>
    );
  }

  return (
    <div>
      {/* API Status */}
      {apiStatus === 'disconnected' && (
        <div style={{
          padding: '16px 24px',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          marginBottom: '24px',
        }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e', marginTop: '4px' }}>
            Could not load reviews from the database. Start the API and refresh: <code>npm run dev:api</code>
          </p>
        </div>
      )}

      {apiStatus === 'connected' && (
        <div style={{
          padding: '12px 24px',
          backgroundColor: '#d1fae5',
          border: '1px solid #22c55e',
          borderRadius: '8px',
          marginBottom: '24px',
        }}>
          <p style={{ fontSize: '14px', color: '#166534' }}>✅ API Connected - Showing database reviews</p>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Reviews</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>{reviews.length} total reviews</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {[
          { value: 'all', label: 'All' },
          { value: 'approved', label: 'Approved' },
          { value: 'pending', label: 'Pending' },
        ].map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value as any)}
            style={{
              padding: '8px 16px',
              backgroundColor: filter === option.value ? '#000' : 'white',
              color: filter === option.value ? '#fff' : '#000',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {option.label}
            {option.value === 'pending' && reviews.filter(r => !r.isApproved).length > 0 && (
              <span style={{
                marginLeft: '6px',
                padding: '2px 6px',
                backgroundColor: '#ef4444',
                color: 'white',
                borderRadius: '50px',
                fontSize: '11px',
              }}>
                {reviews.filter(r => !r.isApproved).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reviews Table */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Product</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>User</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Rating</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Review</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Date</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredReviews.map((review) => (
              <tr key={review.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '16px' }}>
                  <Link href={`/products/${review.productSlug || review.productId}`} style={{
                    textDecoration: 'none',
                    color: '#000',
                    fontWeight: 500,
                    fontSize: '14px',
                  }}>
                    {review.productName || `Product #${review.productId?.slice(0, 8)}`}
                  </Link>
                </td>
                <td style={{ padding: '16px', fontSize: '14px' }}>
                  {review.user?.firstName || 'Anonymous'} {review.user?.lastName?.charAt(0) || ''}
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '2px' }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} style={{ color: i <= review.rating ? '#f59e0b' : '#d1d5db', fontSize: '14px' }}>
                        ★
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: '16px', maxWidth: '300px' }}>
                  {review.title && (
                    <p style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>{review.title}</p>
                  )}
                  <p style={{ fontSize: '13px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {review.comment || 'No comment'}
                  </p>
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '50px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: review.isApproved ? '#d1fae5' : '#fef3c7',
                    color: review.isApproved ? '#22c55e' : '#f59e0b',
                  }}>
                    {review.isApproved ? 'Approved' : 'Pending'}
                  </span>
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#666' }}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    {!review.isApproved && (
                      <button
                        onClick={() => handleApprove(review.id)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#d1fae5',
                          color: '#22c55e',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Approve
                      </button>
                    )}
                    {review.isApproved && (
                      <button
                        onClick={() => handleReject(review.id)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#fef3c7',
                          color: '#f59e0b',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Reject
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(review.id)}
                      style={{
                        padding: '4px 8px',
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredReviews.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
            No reviews found
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '12px', color: '#666' }}>Total Reviews</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{reviews.length}</p>
        </div>
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '12px', color: '#666' }}>Approved</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>{reviews.filter(r => r.isApproved).length}</p>
        </div>
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '12px', color: '#666' }}>Pending</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{reviews.filter(r => !r.isApproved).length}</p>
        </div>
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
        }}>
          <p style={{ fontSize: '12px', color: '#666' }}>Average Rating</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {reviews.length > 0 
              ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
              : '0.0'
            } ★
          </p>
        </div>
      </div>
    </div>
  );
}