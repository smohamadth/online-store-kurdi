/**
 * Component test for AffiliateRefCapture.
 *
 * The component reads ?ref= from the URL on mount, asks the API to track
 * the click (which sets the attribution cookie server-side), and marks the
 * code as tracked in localStorage so it fires once per code per browser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AffiliateRefCapture from './AffiliateRefCapture';

const mockTrack = vi.fn();
vi.mock('@/lib/affiliates', () => ({
  trackAffiliateClick: (...args: unknown[]) => mockTrack(...args),
}));

/** Point window.location at a URL with the given query string. */
function setLocation(url: string) {
  // happy-dom supports history.replaceState; this keeps location.search
  // consistent for the component without navigating the test environment.
  window.history.replaceState({}, '', url);
}

/**
 * Collect unhandled promise rejections for the duration of a test.
 *
 * happy-dom does not dispatch a `window.unhandledrejection` event, so the
 * only reliable observation point is the Node process hook that Vitest also
 * listens on. We temporarily remove Vitest's own listeners so the rejection
 * is recorded here instead of failing the whole file, then restore them.
 */
function captureUnhandled() {
  const unhandled: unknown[] = [];
  const previous = process.listeners('unhandledRejection');
  previous.forEach((l) => process.off('unhandledRejection', l as never));

  const handler = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', handler);

  return {
    unhandled,
    restore() {
      process.off('unhandledRejection', handler);
      previous.forEach((l) => process.on('unhandledRejection', l as never));
    },
  };
}

describe('AffiliateRefCapture', () => {
  beforeEach(() => {
    mockTrack.mockReset();
    localStorage.clear();
    setLocation('/');
  });

  it('renders nothing', () => {
    const { container } = render(<AffiliateRefCapture />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tracks a ?ref= code once and sets the localStorage marker', async () => {
    setLocation('/products?ref=MARTIN-7K2F');
    mockTrack.mockResolvedValue({ valid: true, code: 'MARTIN-7K2F' });

    render(<AffiliateRefCapture />);

    await waitFor(() => expect(mockTrack).toHaveBeenCalledWith('MARTIN-7K2F'));
    expect(localStorage.getItem('aff_tracked_MARTIN-7K2F')).toBe('1');
  });

  it('does not fire twice for the same code in the same browser', async () => {
    setLocation('/?ref=SARA-1');
    mockTrack.mockResolvedValue({ valid: true, code: 'SARA-1' });

    render(<AffiliateRefCapture />);
    await waitFor(() => expect(mockTrack).toHaveBeenCalledTimes(1));

    // Re-render (another page navigation on the same SPA): still one call.
    render(<AffiliateRefCapture />);
    await waitFor(() => expect(mockTrack).toHaveBeenCalledTimes(1));
  });

  it('does not mark invalid codes so a later valid landing can retry', async () => {
    setLocation('/?ref=NOPE-1');
    mockTrack.mockResolvedValue({ valid: false, code: 'NOPE-1' });

    render(<AffiliateRefCapture />);
    await waitFor(() => expect(mockTrack).toHaveBeenCalledWith('NOPE-1'));
    expect(localStorage.getItem('aff_tracked_NOPE-1')).toBeNull();
  });

  it('does nothing without a ref parameter', () => {
    setLocation('/products/1');
    render(<AffiliateRefCapture />);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('never throws even if the API call rejects', async () => {
    setLocation('/?ref=KURD-1');
    mockTrack.mockRejectedValue(new Error('network down'));

    render(<AffiliateRefCapture />);
    await waitFor(() => expect(mockTrack).toHaveBeenCalled());
  });

  /**
   * Regression: the component used to chain `.then()` with no `.catch()`.
   * The surrounding try/catch only guards the SYNCHRONOUS body, so a rejected
   * trackAffiliateClick escaped as an unhandled rejection. The assertion above
   * ("never throws") passed anyway, because an unhandled rejection is not a
   * thrown error in the test's call stack — it surfaced only as a runner-level
   * "Errors 1" line. This test listens for the rejection directly so the bug
   * cannot come back silently.
   */
  it('produces no unhandled promise rejection when tracking fails', async () => {
    const { unhandled, restore } = captureUnhandled();

    try {
      setLocation('/?ref=KURD-REJECT');
      mockTrack.mockRejectedValue(new Error('network down'));

      render(<AffiliateRefCapture />);
      await waitFor(() => expect(mockTrack).toHaveBeenCalled());

      // Let the microtask queue drain so a missing .catch would have fired.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).toEqual([]);
      // A failed track must not mark the code as done: the visitor should get
      // another chance to be attributed on their next landing.
      expect(localStorage.getItem('aff_tracked_KURD-REJECT')).toBeNull();
    } finally {
      restore();
    }
  });

  /**
   * Regression: a quota-exceeded / private-mode localStorage.setItem throw
   * happens INSIDE the .then callback, where the outer try/catch cannot reach
   * it. Without the inner try/catch it would become an unhandled rejection.
   */
  it('survives localStorage.setItem throwing inside the success path', async () => {
    const { unhandled, restore } = captureUnhandled();

    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    try {
      setLocation('/?ref=QUOTA-1');
      mockTrack.mockResolvedValue({ valid: true, code: 'QUOTA-1' });

      render(<AffiliateRefCapture />);
      await waitFor(() => expect(mockTrack).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).toEqual([]);
    } finally {
      Storage.prototype.setItem = setItem;
      restore();
    }
  });
});
