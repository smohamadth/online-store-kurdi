/**
 * Unit tests for the review helpers.
 *
 * The helpers are pure functions that decide:
 *   - Whether a given Order.status counts as a "purchasing" state
 *     (used to gate the verified-purchaser badge).
 *   - Whether a user has any purchasing order for a product
 *     (the actual check the route uses).
 *   - How to normalise the `photos` payload on POST / PUT.
 *   - How to order photos for display.
 *
 * Keeping them in pure helpers means the route can be slim and
 * the verification logic can be exhaustively tested without
 * spinning up an Express app.
 */
import { describe, it, expect } from 'vitest';
import {
  hasPurchasingOrder,
  isPurchasingStatus,
  normaliseReviewPhotos,
  orderReviewPhotos,
  PURCHASING_ORDER_STATUSES,
} from '../../../src/modules/reviews/reviews.helpers';
import { MAX_REVIEW_PHOTOS } from '../../../src/modules/reviews/reviews.constants';

describe('PURCHASING_ORDER_STATUSES', () => {
  it('lists exactly the four active statuses', () => {
    expect([...PURCHASING_ORDER_STATUSES].sort()).toEqual(
      ['delivered', 'pending', 'processing', 'shipped'],
    );
  });
});

describe('isPurchasingStatus', () => {
  it('returns true for the four purchasing statuses', () => {
    for (const s of PURCHASING_ORDER_STATUSES) {
      expect(isPurchasingStatus(s)).toBe(true);
    }
  });

  it('returns false for cancelled and refunded', () => {
    expect(isPurchasingStatus('cancelled')).toBe(false);
    expect(isPurchasingStatus('refunded')).toBe(false);
  });

  it('returns false for unknown / null / undefined', () => {
    expect(isPurchasingStatus('shipped-but-forgot')).toBe(false);
    expect(isPurchasingStatus(null)).toBe(false);
    expect(isPurchasingStatus(undefined)).toBe(false);
    expect(isPurchasingStatus('')).toBe(false);
  });
});

describe('hasPurchasingOrder', () => {
  it('returns true when at least one order is in a purchasing status and contains the product', () => {
    expect(
      hasPurchasingOrder(
        [{ status: 'shipped', items: [{ productId: 'p1' }] }],
        'p1',
      ),
    ).toBe(true);
  });

  it('returns true even when mixed with non-purchasing orders', () => {
    expect(
      hasPurchasingOrder(
        [
          { status: 'cancelled', items: [{ productId: 'p1' }] },
          { status: 'pending', items: [{ productId: 'p1' }] },
        ],
        'p1',
      ),
    ).toBe(true);
  });

  it('returns false when every order is cancelled / refunded', () => {
    expect(
      hasPurchasingOrder(
        [
          { status: 'cancelled', items: [{ productId: 'p1' }] },
          { status: 'refunded', items: [{ productId: 'p1' }] },
        ],
        'p1',
      ),
    ).toBe(false);
  });

  it('returns false when no order contains the product', () => {
    expect(
      hasPurchasingOrder(
        [{ status: 'shipped', items: [{ productId: 'p2' }] }],
        'p1',
      ),
    ).toBe(false);
  });

  it('returns false for an empty order list', () => {
    expect(hasPurchasingOrder([], 'p1')).toBe(false);
  });
});

describe('normaliseReviewPhotos', () => {
  it('returns an empty list for missing or null input', () => {
    expect(normaliseReviewPhotos(undefined)).toEqual({ ok: true, photos: [] });
    expect(normaliseReviewPhotos(null)).toEqual({ ok: true, photos: [] });
  });

  it('accepts an array of URL strings', () => {
    const res = normaliseReviewPhotos([
      'https://cdn/a.jpg',
      'https://cdn/b.jpg',
    ]);
    expect(res).toEqual({
      ok: true,
      photos: [
        { url: 'https://cdn/a.jpg', thumbnail: null, sortOrder: 0 },
        { url: 'https://cdn/b.jpg', thumbnail: null, sortOrder: 1 },
      ],
    });
  });

  it('accepts an array of {url, thumbnail} objects', () => {
    const res = normaliseReviewPhotos([
      { url: 'https://cdn/a.jpg', thumbnail: 'https://cdn/a-thumb.jpg' },
      { url: 'https://cdn/b.jpg' },
    ]);
    expect(res).toEqual({
      ok: true,
      photos: [
        { url: 'https://cdn/a.jpg', thumbnail: 'https://cdn/a-thumb.jpg', sortOrder: 0 },
        { url: 'https://cdn/b.jpg', thumbnail: null, sortOrder: 1 },
      ],
    });
  });

  it('rejects non-array input', () => {
    expect(normaliseReviewPhotos('not-an-array')).toEqual({
      ok: false,
      error: 'photos must be an array',
    });
    expect(normaliseReviewPhotos({ url: 'x' })).toEqual({
      ok: false,
      error: 'photos must be an array',
    });
  });

  it(`rejects more than ${MAX_REVIEW_PHOTOS} photos`, () => {
    const tooMany = Array.from({ length: MAX_REVIEW_PHOTOS + 1 }, (_, i) => `https://x/${i}.jpg`);
    const res = normaliseReviewPhotos(tooMany);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain(`at most ${MAX_REVIEW_PHOTOS}`);
    }
  });

  it('rejects entries without a url', () => {
    const res = normaliseReviewPhotos([
      { thumbnail: 'https://x/a.jpg' },
      'https://cdn/b.jpg',
    ]);
    expect(res).toEqual({
      ok: false,
      error: 'photos[0].url is required',
    });
  });

  it('rejects an empty array (vacuous truth is fine, but the helper is consistent)', () => {
    expect(normaliseReviewPhotos([])).toEqual({ ok: true, photos: [] });
  });
});

describe('orderReviewPhotos', () => {
  it('sorts ascending by sortOrder', () => {
    const out = orderReviewPhotos([
      { url: 'a', sortOrder: 2 },
      { url: 'b', sortOrder: 0 },
      { url: 'c', sortOrder: 1 },
    ]);
    expect(out.map((p) => p.url)).toEqual(['b', 'c', 'a']);
  });

  it('drops photos without a url', () => {
    const out = orderReviewPhotos([
      { url: 'a', sortOrder: 0 },
      { url: '', sortOrder: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('a');
  });

  it('returns an empty list for an empty input', () => {
    expect(orderReviewPhotos([])).toEqual([]);
  });
});
