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
});
