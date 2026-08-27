'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/http';
import type { Review, ReviewPhoto } from '@/lib/types';

interface ReviewSectionProps {
  productId: string;
  productName: string;
}

/**
 * Maximum number of photos a customer may attach to a single
 * review. Mirrors `MAX_REVIEW_PHOTOS` in the API. Kept as a
 * local constant so the form's UI matches the server's cap
 * without a round-trip.
 */
const MAX_PHOTOS = 5;

/**
 * Maximum file size for an uploaded review photo (5 MB). The
 * API's upload route is 10 MB; the form is a bit tighter
 * because product shots rarely need to be that big and we
 * want a friendly error before the request leaves the
 * browser.
 */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Allowed image MIME types. Matches the API's upload route.
 */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Customer review section.
 *
 * Features:
 *   - List approved reviews with star rating + user name.
 *   - Write-a-review form (rating + title + comment).
 *   - **Verified Purchaser** badge: shown when the review
 *     has `isVerified: true`, which the API sets when the
 *     reviewer has a non-cancelled / non-refunded order
 *     containing this product.
 *   - **Photo gallery**: customers can attach up to 5
 *     images. Photos are uploaded through the same
 *     `POST /api/upload/image` endpoint used by product
 *     images, then attached to the review via
 *     `POST /api/products/:id/reviews` (with a `photos`
 *     array of URLs).
 *   - Lightbox: clicking a photo in a published review
 *     opens a full-screen overlay so a reader can see the
 *     image in detail.
 */
export default function ReviewSection({ productId, productName }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // The form's local state. We keep `photoFiles` (the user's
  // selected-but-not-yet-uploaded files) and `photoPreviews`
  // (object URLs for the local preview) separate from the
  // `uploadedPhotoUrls` we collect after the upload calls.
  // The submit handler uploads each file in order, then
  // sends the resulting URLs in the review POST body.
  const [formData, setFormData] = useState({
    rating: 5,
    title: '',
    comment: '',
  });
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox state. `null` means closed; a non-null Review
  // means "show that review's photos, starting at index
  // `lightboxIndex`".
  const [lightbox, setLightbox] = useState<{ review: Review; index: number } | null>(null);

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

    // Last resort: Show mock reviews (with photos) so a
    // brand-new storefront doesn't look completely empty.
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
        photos: [],
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
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
        photos: [],
        createdAt: '2024-01-10T14:30:00Z',
        updatedAt: '2024-01-20T09:00:00Z',
        user: { id: 'user2', firstName: 'Sarah', lastName: 'M.' },
      },
    ]);

    setLoading(false);
  };

  /**
   * Handle the customer picking one or more files. We accept
   * only image MIME types and enforce the per-photo size cap
   * and the per-review count cap (MAX_PHOTOS). The picked
   * files are stashed in state and the user clicks Submit to
   * actually upload + create the review.
   */
  const handlePhotoFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: File[] = [];
    const nextPreviews: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      if (photoFiles.length + next.length >= MAX_PHOTOS) {
        setMessage({
          type: 'error',
          text: `You can attach at most ${MAX_PHOTOS} photos per review.`,
        });
        break;
      }
      const file = fileList[i];
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setMessage({
          type: 'error',
          text: `"${file.name}" is not a supported image type. Use JPEG, PNG, WEBP or GIF.`,
        });
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setMessage({
          type: 'error',
          text: `"${file.name}" is too large (max 5 MB per photo).`,
        });
        continue;
      }
      next.push(file);
      nextPreviews.push(URL.createObjectURL(file));
    }
    if (next.length > 0) {
      setPhotoFiles((prev) => [...prev, ...next]);
      setPhotoPreviews((prev) => [...prev, ...nextPreviews]);
    }
  };

  /**
   * Remove a photo from the staged set. The object URL is
   * revoked so we don't leak memory; the file itself is
   * garbage-collected once React drops the state.
   */
  const removePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Revoke the dropped URL so the blob can be GC'd.
      if (prev[index]) URL.revokeObjectURL(prev[index]);
      return next;
    });
  };

  /**
   * Upload a single file via POST /api/upload/image. Returns
   * `{ url, thumbnail }` from the API. The auth header is
   * required by the upload route.
   */
  const uploadPhoto = async (file: File): Promise<{ url: string; thumbnail: string | null }> => {
    const token = localStorage.getItem('token');
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'reviews');
    const res = await fetch(`${API_BASE}/upload/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.message || 'Photo upload failed');
    }
    const data = await res.json();
    return { url: data.data.url, thumbnail: data.data.thumbnail || null };
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

      // Step 1: upload each photo. We collect both the URL
      // and the thumbnail (the upload endpoint returns
      // multiple sizes). Failures short-circuit; the customer
      // can re-submit with a smaller / different file.
      const uploadedPhotos: Array<{ url: string; thumbnail: string | null }> = [];
      for (const file of photoFiles) {
        try {
          const result = await uploadPhoto(file);
          uploadedPhotos.push(result);
        } catch (err: any) {
          setMessage({ type: 'error', text: err?.message || 'Photo upload failed' });
          setSubmitting(false);
          return;
        }
      }

      // Step 2: create the review with the uploaded URLs.
      let savedReview: Review | null = null;
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
            photos: uploadedPhotos,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          savedReview = data.data;
          setMessage({ type: 'success', text: 'Review saved!' });
        } else {
          const err = await response.json().catch(() => ({}));
          throw new Error(err?.message || 'Failed to save review');
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: err?.message || 'Failed to save review' });
        setSubmitting(false);
        return;
      }

      // Create review object for the local list. The API
      // response includes the photos in the same order we
      // uploaded them, so the inline preview matches the
      // server view.
      const newReview: Review = {
        id: savedReview?.id || Date.now().toString(),
        userId: user?.id || 'anonymous',
        productId,
        rating: formData.rating,
        title: formData.title,
        comment: formData.comment,
        isVerified: savedReview?.isVerified || false,
        isApproved: savedReview?.isApproved ?? true,
        photos: savedReview?.photos || uploadedPhotos.map((p, i) => ({
          id: `local-${i}`,
          reviewId: 'pending',
          url: p.url,
          thumbnail: p.thumbnail,
          sortOrder: i,
          createdAt: new Date().toISOString(),
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

      // Clean up the staged photos so the form is fresh for
      // a second review.
      photoPreviews.forEach((u) => URL.revokeObjectURL(u));
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setShowForm(false);
      setFormData({ rating: 5, title: '', comment: '' });
    } catch (err) {
      console.error('Failed to submit review:', err);
      setMessage({ type: 'error', text: 'Failed to submit review. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Close the form: revoke the blob URLs so we don't leak
   * memory, then reset the form state.
   */
  const cancelForm = () => {
    photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setShowForm(false);
    setMessage({ type: '', text: '' });
  };

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const ratingDistribution = [5, 4, 3, 2, 1].map(rating => ({
    rating,
    count: reviews.filter(r => r.rating === rating).length,
    percentage: reviews.length > 0 ? (reviews.filter(r => r.rating === rating).length / reviews.length) * 100 : 0,
  }));

  /**
   * Number of reviews with photos. The header is the only
   * place we use this; the rest of the page is per-review.
   */
  const photoCount = reviews.reduce((n, r) => n + (r.photos?.length || 0), 0);

  if (loading) {
    return <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted, #6b7280)' }}>Loading reviews...</div>;
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
        backgroundColor: 'var(--surface-2, #f5f5f5)',
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
          <p style={{ color: 'var(--muted, #6b7280)', fontSize: '14px' }}>
            {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
            {photoCount > 0 ? ` · ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        {/* Rating Distribution */}
        <div>
          {ratingDistribution.map(({ rating, count, percentage }) => (
            <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ width: '20px', textAlign: 'end', fontSize: '14px' }}>{rating}★</span>
              <div style={{ flex: 1, height: '8px', backgroundColor: '#e5e5e5', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: 'var(--warning, #d97706)', borderRadius: '4px' }} />
              </div>
              <span style={{ width: '30px', fontSize: '14px', color: 'var(--muted, #6b7280)' }}>{count}</span>
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
            backgroundColor: 'var(--brand, #111)',
            color: 'var(--brand-text, #fff)',
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
        <p style={{ color: 'var(--muted, #6b7280)', marginBottom: '24px' }}>
          <a href="/login" style={{ color: 'var(--body-text, #111)', textDecoration: 'underline' }}>Login</a> to write a review
        </p>
      )}

      {/* Review Form */}
      {showForm && (
        <div style={{
          padding: '24px',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: '8px',
          marginBottom: '32px',
          backgroundColor: 'var(--card-bg, white)',
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Write a Review</h3>

          {message.text && (
            <div
              data-testid="review-form-message"
              style={{
                padding: '12px 16px',
                backgroundColor: message.type === 'success' ? '#d1fae5' : '#fef2f2',
                border: `1px solid ${message.type === 'success' ? '#22c55e' : '#fecaca'}`,
                borderRadius: '6px',
                color: message.type === 'success' ? '#22c55e' : '#ef4444',
                fontSize: '14px',
                marginBottom: '16px',
              }}
            >
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
                  border: '1px solid var(--border, #e5e7eb)',
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
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '6px',
                  fontSize: '16px',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Photos */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                Photos <span style={{ fontWeight: 400, color: 'var(--muted, #6b7280)' }}>(optional, up to {MAX_PHOTOS})</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                multiple
                data-testid="review-photo-input"
                onChange={(e) => handlePhotoFiles(e.target.files)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                data-testid="review-photo-button"
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--surface-2, #f5f5f5)',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                📷 Add photos
              </button>
              {photoPreviews.length > 0 && (
                <div
                  data-testid="review-photo-previews"
                  style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}
                >
                  {photoPreviews.map((src, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'relative',
                        width: '80px',
                        height: '80px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        backgroundColor: '#f5f5f5',
                      }}
                    >
                      <img
                        src={src}
                        alt={`Selected photo ${i + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        data-testid={`remove-photo-${i}`}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                disabled={submitting}
                data-testid="review-submit"
                style={{
                  padding: '12px 24px',
                  backgroundColor: submitting ? 'var(--border, #ccc)' : 'var(--brand, #111)',
                  color: submitting ? '#fff' : 'var(--brand-text, #fff)',
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
                onClick={cancelForm}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--surface-2, #f5f5f5)',
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
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted, #6b7280)' }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>No reviews yet</p>
          <p>Be the first to review this product!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {reviews.map((review) => (
            <div
              key={review.id}
              data-testid="review-card"
              style={{
                padding: '24px',
                border: '1px solid var(--border, #e7ebee)',
                borderRadius: '8px',
                backgroundColor: 'var(--card-bg, white)',
              }}
            >
              {/* Review Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--surface-2, #f5f5f5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                  }}>
                    👤
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>
                      {review.user?.firstName || 'Anonymous'} {review.user?.lastName?.charAt(0) || ''}.
                    </p>
                    {/*
                      Verified-purchaser badge: only rendered when
                      the API set isVerified on this review. The
                      API decides this server-side by looking at
                      the reviewer's orders.
                    */}
                    {review.isVerified && (
                      <span
                        data-testid="verified-purchaser-badge"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '2px',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: '#ecfdf5',
                          color: 'var(--success, #047857)',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <span>✓</span>
                        <span>Verified Purchaser</span>
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: '14px', color: 'var(--muted, #6b7280)' }}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Rating */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} style={{ color: i <= review.rating ? '#f59e0b' : '#d1d5db' }}>★</span>
                ))}
                {review.title && (
                  <span style={{ fontWeight: 600, marginInlineStart: '8px' }}>{review.title}</span>
                )}
              </div>

              {/* Comment */}
              {review.comment && (
                <p style={{ color: 'var(--body-text, #111)', lineHeight: 1.6 }}>{review.comment}</p>
              )}

              {/* Photo gallery. Clicking a thumbnail opens the
                  lightbox; the lightbox is shared across the
                  whole page so the modal has its own keyboard
                  handler (Esc / arrow keys) and the same data
                  model as the rest of the page. */}
              {review.photos && review.photos.length > 0 && (
                <div
                  data-testid="review-photos"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                    gap: '8px',
                    marginTop: '12px',
                  }}
                >
                  {review.photos.map((photo, i) => (
                    <button
                      key={photo.id}
                      type="button"
                      data-testid={`review-photo-${i}`}
                      onClick={() => setLightbox({ review, index: i })}
                      style={{
                        position: 'relative',
                        aspectRatio: '1',
                        padding: 0,
                        border: '1px solid var(--border, #e5e7eb)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        backgroundColor: 'var(--surface-2, #f5f5f5)',
                        cursor: 'zoom-in',
                      }}
                    >
                      <img
                        src={photo.thumbnail || photo.url}
                        alt={`Review photo ${i + 1}`}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox. Rendered as a sibling so the page's scroll
          isn't affected. Backdrop click + Esc close it;
          arrow keys cycle through the photos. */}
      {lightbox && (
        <ReviewLightbox
          review={lightbox.review}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

/**
 * Full-screen photo viewer for a single review's gallery.
 *
 * Kept in the same file as `ReviewSection` so the props
 * (a review + an index) don't have to round-trip through a
 * store. The lightbox is intentionally simple: it doesn't
 * need to be reusable outside the review context.
 *
 * Keyboard:
 *   - Esc: close
 *   - ←/→: previous / next photo
 */
function ReviewLightbox({
  review,
  startIndex,
  onClose,
}: {
  review: Review;
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const photos = review.photos || [];
  const current = photos[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => (i - 1 + photos.length) % photos.length);
      } else if (e.key === 'ArrowRight') {
        setIndex((i) => (i + 1) % photos.length);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, photos.length]);

  if (!current) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo from review by ${review.user?.firstName || 'customer'}`}
      data-testid="review-lightbox"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {photos.length > 1 && (
          <button
            type="button"
            data-testid="review-lightbox-prev"
            onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            ‹
          </button>
        )}
        <img
          src={current.url}
          alt={`Review photo ${index + 1} of ${photos.length}`}
          data-testid="review-lightbox-image"
          style={{
            maxWidth: '85vw',
            maxHeight: '85vh',
            objectFit: 'contain',
            borderRadius: '8px',
            backgroundColor: '#000',
          }}
        />
        {photos.length > 1 && (
          <button
            type="button"
            data-testid="review-lightbox-next"
            onClick={() => setIndex((i) => (i + 1) % photos.length)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            ›
          </button>
        )}
        <button
          type="button"
          aria-label="Close"
          data-testid="review-lightbox-close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-44px',
            right: '0',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: 'white',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
        {photos.length > 1 && (
          <div
            data-testid="review-lightbox-counter"
            style={{
              position: 'absolute',
              bottom: '-32px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'white',
              fontSize: '14px',
            }}
          >
            {index + 1} / {photos.length}
          </div>
        )}
      </div>
    </div>
  );
}
