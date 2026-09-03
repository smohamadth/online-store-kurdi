/**
 * Marketing API client.
 *
 * The contract that matters: these are marketing calls on a shopping page, so
 * a failure must degrade to "nothing happened" rather than throwing into a
 * render and breaking the storefront.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('./http', () => ({
  http: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
  },
}));

import { getBundles, getBundle, captureEmail, subscribeNewsletter } from './marketing';

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('getBundles', () => {
  it('returns the payload', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 'b1' }] });
    await expect(getBundles()).resolves.toEqual([{ id: 'b1' }]);
    expect(mockGet).toHaveBeenCalledWith('/bundles');
  });

  it('returns [] when the API throws', async () => {
    // A product page must still render if bundles are unavailable.
    mockGet.mockRejectedValue(new Error('network'));
    await expect(getBundles()).resolves.toEqual([]);
  });

  it('returns [] when the envelope has no data', async () => {
    mockGet.mockResolvedValue({});
    await expect(getBundles()).resolves.toEqual([]);
  });
});

describe('getBundle', () => {
  it('encodes the slug so a crafted value cannot alter the path', async () => {
    mockGet.mockResolvedValue({ data: { id: 'x' } });
    await getBundle('a/../../admin');
    expect(mockGet).toHaveBeenCalledWith('/bundles/a%2F..%2F..%2Fadmin');
  });

  it('returns null for a missing bundle', async () => {
    mockGet.mockRejectedValue(new Error('404'));
    await expect(getBundle('nope')).resolves.toBeNull();
  });

  it('returns null when data is absent', async () => {
    mockGet.mockResolvedValue({ data: undefined });
    await expect(getBundle('x')).resolves.toBeNull();
  });
});

describe('captureEmail', () => {
  it('posts the address and trigger', async () => {
    mockPost.mockResolvedValue({});
    await expect(captureEmail('a@b.com', 'timed')).resolves.toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/marketing/capture', {
      email: 'a@b.com',
      trigger: 'timed',
    });
  });

  it('defaults the trigger to exit_intent', async () => {
    mockPost.mockResolvedValue({});
    await captureEmail('a@b.com');
    expect(mockPost).toHaveBeenCalledWith('/marketing/capture', {
      email: 'a@b.com',
      trigger: 'exit_intent',
    });
  });

  it('resolves false instead of throwing when the API fails', async () => {
    // The popup shows a retryable error; an exception here would surface as a
    // broken page to a shopper who was only half-interested.
    mockPost.mockRejectedValue(new Error('500'));
    await expect(captureEmail('a@b.com')).resolves.toBe(false);
  });
});

describe('subscribeNewsletter', () => {
  it('posts email and source', async () => {
    mockPost.mockResolvedValue({});
    await expect(subscribeNewsletter('a@b.com', 'checkout')).resolves.toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/newsletter/subscribe', {
      email: 'a@b.com',
      source: 'checkout',
    });
  });

  it('defaults the source to footer', async () => {
    mockPost.mockResolvedValue({});
    await subscribeNewsletter('a@b.com');
    expect(mockPost).toHaveBeenCalledWith('/newsletter/subscribe', {
      email: 'a@b.com',
      source: 'footer',
    });
  });

  it('resolves false on failure', async () => {
    mockPost.mockRejectedValue(new Error('boom'));
    await expect(subscribeNewsletter('a@b.com')).resolves.toBe(false);
  });
});
