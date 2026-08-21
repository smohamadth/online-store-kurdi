'use client';

import { useState } from 'react';
import { validateCoupon, formatDiscount, Coupon } from '@/lib/coupons';

interface CouponInputProps {
  subtotal: number;
  onApply: (coupon: Coupon, discount: number) => void;
  onRemove: () => void;
  appliedCoupon?: Coupon | null;
}

export default function CouponInput({ subtotal, onApply, onRemove, appliedCoupon }: CouponInputProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleApply = async () => {
    if (!code.trim()) {
      setError('Please enter a coupon code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await validateCoupon(code.trim(), subtotal);

      if (result.valid && result.coupon && result.discount !== undefined) {
        onApply(result.coupon, result.discount);
        setCode('');
      } else {
        setError(result.error || 'Invalid coupon');
      }
    } catch (err) {
      console.error('Failed to validate coupon:', err);
      setError('Failed to validate coupon. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  };

  // Show applied coupon
  if (appliedCoupon) {
    return (
      <div style={{
        padding: '16px',
        backgroundColor: '#f0fdf4',
        border: '1px solid #22c55e',
        borderRadius: '6px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600, color: 'var(--success, #16a34a)' }}>✓ Coupon Applied</span>
            <p style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              <strong>{appliedCoupon.code}</strong> - {formatDiscount(appliedCoupon)}
            </p>
          </div>
          <button
            onClick={onRemove}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              color: 'var(--danger, #dc2626)',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
        Coupon Code
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
          }}
          onKeyPress={handleKeyPress}
          placeholder="Enter coupon code"
          style={{
            flex: 1,
            padding: '10px 14px',
            border: `1px solid ${error ? '#ef4444' : '#e5e5e5'}`,
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
            textTransform: 'uppercase',
          }}
        />
        <button
          onClick={handleApply}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? 'var(--border, #ccc)' : 'var(--brand, #111)',
            color: loading ? '#fff' : 'var(--brand-text, #fff)',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Applying...' : 'Apply'}
        </button>
      </div>
      {error && (
        <p style={{ fontSize: '12px', color: 'var(--danger, #dc2626)', marginTop: '6px' }}>{error}</p>
      )}
      <p style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '6px' }}>
        Try: WELCOME10, SAVE20, FREESHIP
      </p>
    </div>
  );
}