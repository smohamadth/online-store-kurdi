/**
 * CouponInput.
 *
 * Two render paths:
 *   - appliedCoupon provided: shows the green "Coupon Applied" panel
 *     with a Remove button.
 *   - no appliedCoupon: shows the input + Apply button.
 *
 * Behaviors to cover:
 *   - Empty input on Apply: shows the "Please enter a coupon code" error.
 *   - Successful validateCoupon: calls onApply, clears the input.
 *   - Failed validateCoupon: shows the returned error message.
 *   - Thrown error: shows a generic "Failed to validate" message.
 *   - Enter key triggers Apply.
 *   - Input is uppercased on change.
 *   - Remove button calls onRemove.
 *   - Apply button shows the loading label while a validation is in flight.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import CouponInput from '@/components/CouponInput';
import type { Coupon } from '@/lib/coupons';

vi.mock('@/lib/coupons', async () => {
  const actual = await vi.importActual<any>('@/lib/coupons');
  return {
    ...actual,
    validateCoupon: vi.fn(),
    formatDiscount: actual.formatDiscount,
  };
});

const sampleCoupon: Coupon = {
  id: 'c1',
  code: 'WELCOME10',
  description: '10% off',
  type: 'percentage',
  value: 10,
  minPurchase: 0,
  maxDiscount: null,
  usageLimit: null,
  usageCount: 0,
  perUserLimit: null,
  startsAt: null,
  expiresAt: null,
  isActive: true,
};

import { validateCoupon } from '@/lib/coupons';
const mockValidate = vi.mocked(validateCoupon);

beforeEach(() => {
  mockValidate.mockReset();
});

describe('CouponInput (unapplied)', () => {
  it('renders an input and an Apply button with the placeholder', () => {
    render(<CouponInput subtotal={100} onApply={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByPlaceholderText(/coupon code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
  });

  it('uppercases input on change', () => {
    render(<CouponInput subtotal={100} onApply={vi.fn()} onRemove={vi.fn()} />);
    const input = screen.getByPlaceholderText(/coupon code/i) as HTMLInputElement;
    act(() => {
      input.focus();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Simulate user typing via the native value setter so React sees it.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, 'welcome10');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('WELCOME10');
  });

  it('shows an error when Apply is clicked with an empty input', async () => {
    render(<CouponInput subtotal={100} onApply={vi.fn()} onRemove={vi.fn()} />);
    act(() => {
      screen.getByRole('button', { name: /apply/i }).click();
    });
    expect(screen.getByText(/please enter a coupon code/i)).toBeInTheDocument();
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('calls onApply with the coupon and discount when validation succeeds', async () => {
    mockValidate.mockResolvedValue({
      valid: true,
      coupon: sampleCoupon,
      discount: 10,
    });
    const onApply = vi.fn();
    render(<CouponInput subtotal={100} onApply={onApply} onRemove={vi.fn()} />);
    const input = screen.getByPlaceholderText(/coupon code/i) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, 'welcome10');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await act(async () => {
      screen.getByRole('button', { name: /apply/i }).click();
    });
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith(sampleCoupon, 10);
    });
    // Input cleared after a successful apply.
    expect(input.value).toBe('');
  });

  it('shows the returned error when validation fails', async () => {
    mockValidate.mockResolvedValue({ valid: false, error: 'Coupon expired' });
    render(<CouponInput subtotal={100} onApply={vi.fn()} onRemove={vi.fn()} />);
    const input = screen.getByPlaceholderText(/coupon code/i) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, 'EXPIRED');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await act(async () => {
      screen.getByRole('button', { name: /apply/i }).click();
    });
    expect(screen.getByText('Coupon expired')).toBeInTheDocument();
  });

  it('falls back to a generic error when the validator throws', async () => {
    mockValidate.mockRejectedValue(new Error('network'));
    render(<CouponInput subtotal={100} onApply={vi.fn()} onRemove={vi.fn()} />);
    const input = screen.getByPlaceholderText(/coupon code/i) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, 'WELCOME10');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await act(async () => {
      screen.getByRole('button', { name: /apply/i }).click();
    });
    expect(screen.getByText(/failed to validate/i)).toBeInTheDocument();
  });

  it('Enter key triggers Apply', async () => {
    mockValidate.mockResolvedValue({ valid: true, coupon: sampleCoupon, discount: 10 });
    const onApply = vi.fn();
    render(<CouponInput subtotal={100} onApply={onApply} onRemove={vi.fn()} />);
    const input = screen.getByPlaceholderText(/coupon code/i) as HTMLInputElement;
    // userEvent fires the full event chain the source expects, including
    // a real keypress event for Enter.
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    await user.type(input, 'WELCOME10{enter}');
    await waitFor(() => {
      expect(mockValidate).toHaveBeenCalledWith('WELCOME10', 100);
    });
  });
});

describe('CouponInput (applied)', () => {
  it('renders the green "Coupon Applied" panel with a Remove button', () => {
    render(
      <CouponInput
        subtotal={100}
        onApply={vi.fn()}
        onRemove={vi.fn()}
        appliedCoupon={sampleCoupon}
      />,
    );
    expect(screen.getByText(/coupon applied/i)).toBeInTheDocument();
    expect(screen.getByText('WELCOME10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('Remove button calls onRemove', () => {
    const onRemove = vi.fn();
    render(
      <CouponInput
        subtotal={100}
        onApply={vi.fn()}
        onRemove={onRemove}
        appliedCoupon={sampleCoupon}
      />,
    );
    act(() => {
      screen.getByRole('button', { name: /remove/i }).click();
    });
    expect(onRemove).toHaveBeenCalled();
  });
});
