'use client';

// Coupon types
export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
}

export interface CouponValidation {
  valid: boolean;
  coupon?: Coupon;
  discount?: number;
  error?: string;
}

// Sample coupons for demo
const SAMPLE_COUPONS: Coupon[] = [
  {
    id: '1',
    code: 'WELCOME10',
    type: 'percentage',
    value: 10,
    minOrderAmount: 50,
    maxDiscountAmount: 100,
    usageLimit: 100,
    usedCount: 45,
    isActive: true,
    startsAt: '2024-01-01T00:00:00Z',
    expiresAt: '2025-12-31T23:59:59Z',
  },
  {
    id: '2',
    code: 'SAVE20',
    type: 'fixed',
    value: 20,
    minOrderAmount: 100,
    maxDiscountAmount: null,
    usageLimit: 50,
    usedCount: 23,
    isActive: true,
    startsAt: '2024-01-01T00:00:00Z',
    expiresAt: '2025-12-31T23:59:59Z',
  },
  {
    id: '3',
    code: 'FREESHIP',
    type: 'free_shipping',
    value: 0,
    minOrderAmount: 75,
    maxDiscountAmount: null,
    usageLimit: null,
    usedCount: 120,
    isActive: true,
    startsAt: '2024-01-01T00:00:00Z',
    expiresAt: null,
  },
  {
    id: '4',
    code: 'FLAT50',
    type: 'fixed',
    value: 50,
    minOrderAmount: 200,
    maxDiscountAmount: null,
    usageLimit: 25,
    usedCount: 10,
    isActive: true,
    startsAt: '2024-01-01T00:00:00Z',
    expiresAt: '2025-06-30T23:59:59Z',
  },
  {
    id: '5',
    code: 'EXPIRED',
    type: 'percentage',
    value: 15,
    minOrderAmount: null,
    maxDiscountAmount: null,
    usageLimit: 100,
    usedCount: 100,
    isActive: false,
    startsAt: '2023-01-01T00:00:00Z',
    expiresAt: '2023-12-31T23:59:59Z',
  },
];

// Get all coupons (for admin) - try API first
export async function getCoupons(token: string): Promise<Coupon[]> {
  // Try API first
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/coupons`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        return data.data;
      }
    }
  } catch (err) {
    console.log('Coupon API not available, using local data');
  }
  
  // Fallback to sample coupons
  return SAMPLE_COUPONS;
}

// Validate coupon - try API first, then local
export async function validateCoupon(code: string, subtotal: number): Promise<CouponValidation> {
  // Try API first
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal }),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.data || { valid: false, error: 'Invalid coupon' };
    }
  } catch (err) {
    console.log('Coupon API not available, using local validation');
  }
  
  // Fallback to local validation
  return validateCouponLocally(code, subtotal);
}

// Local coupon validation
function validateCouponLocally(code: string, subtotal: number): CouponValidation {
  const coupon = SAMPLE_COUPONS.find(
    c => c.code.toUpperCase() === code.toUpperCase()
  );

  if (!coupon) {
    return { valid: false, error: 'Invalid coupon code' };
  }

  if (!coupon.isActive) {
    return { valid: false, error: 'This coupon is no longer active' };
  }

  // Check expiry
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, error: 'This coupon has expired' };
  }

  // Check start date
  if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) {
    return { valid: false, error: 'This coupon is not yet active' };
  }

  // Check usage limit
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, error: 'This coupon has reached its usage limit' };
  }

  // Check minimum order amount
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    return {
      valid: false,
      error: `Minimum order amount is $${coupon.minOrderAmount.toFixed(2)}`,
    };
  }

  // Calculate discount
  let discount = 0;

  switch (coupon.type) {
    case 'percentage':
      discount = subtotal * (coupon.value / 100);
      if (coupon.maxDiscountAmount) {
        discount = Math.min(discount, coupon.maxDiscountAmount);
      }
      break;

    case 'fixed':
      discount = coupon.value;
      break;

    case 'free_shipping':
      discount = 0; // Handled separately
      break;
  }

  return {
    valid: true,
    coupon,
    discount: Math.round(discount * 100) / 100,
  };
}

// Format discount display
export function formatDiscount(coupon: Coupon): string {
  switch (coupon.type) {
    case 'percentage':
      return `${coupon.value}% off`;
    case 'fixed':
      return `$${coupon.value} off`;
    case 'free_shipping':
      return 'Free shipping';
    default:
      return '';
  }
}

// Create coupon (admin)
export async function createCoupon(token: string, couponData: Partial<Coupon>): Promise<Coupon | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/coupons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(couponData),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.data;
    }
  } catch (err) {
    console.error('Failed to create coupon:', err);
  }
  
  return null;
}

// Update coupon (admin)
export async function updateCoupon(token: string, couponId: string, couponData: Partial<Coupon>): Promise<Coupon | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/coupons/${couponId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(couponData),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.data;
    }
  } catch (err) {
    console.error('Failed to update coupon:', err);
  }
  
  return null;
}

// Delete coupon (admin)
export async function deleteCoupon(token: string, couponId: string): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/coupons/${couponId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    
    return response.ok;
  } catch (err) {
    console.error('Failed to delete coupon:', err);
    return false;
  }
}