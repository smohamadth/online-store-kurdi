/**
 * Review helpers — pure functions used by the review routes and
 * the moderation/admin queue.
 *
 * Kept separate from `review.routes.ts` so the verification and
 * photo-validation logic can be unit-tested without loading the
 * full Express app (which transitively imports prisma + redis +
 * minio and fails in the test runner that uses a mock prisma).
 */

import { MAX_REVIEW_PHOTOS } from './reviews.constants';
import { isSafeLinkUrl } from '../../utils/safeUrl';

/**
 * Order statuses that count as a "purchase" for the
 * verified-purchaser badge. Anything that means the order was
 * paid for and the customer actually got / will get the
 * product. `cancelled` and `refunded` are intentionally
 * excluded — a customer who returned the product shouldn't get
 * to vouch for it.
 */
export const PURCHASING_ORDER_STATUSES = [
  'pending',
  'processing',
  'shipped',
  'delivered',
] as const;

export type PurchasingStatus = (typeof PURCHASING_ORDER_STATUSES)[number];

/**
 * Decide whether a status counts as a purchase. Unknown values
 * (the Order.status column is a free-form string) are treated
 * as "not a purchase" so a typo or future status can't silently
 * turn the badge on.
 */
export function isPurchasingStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (PURCHASING_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * `true` when at least one of the caller's orders for this
 * product is in a purchasing status. The "orders" argument is
 * the shape the route will hand us after a small `select`:
 *
 *     [{ status: 'shipped', items: [{ productId: 'p1' }] }, ...]
 *
 * We don't depend on prisma here so this stays a pure function
 * and is easy to unit-test.
 */
export function hasPurchasingOrder(
  orders: ReadonlyArray<{
    status: string;
    items: ReadonlyArray<{ productId: string }>;
  }>,
  productId: string,
): boolean {
  for (const o of orders) {
    if (!isPurchasingStatus(o.status)) continue;
    if (o.items.some((it) => it.productId === productId)) return true;
  }
  return false;
}

/**
 * Normalise the `photoIds` array from a request body. Returns
 * either a list of objects ready to insert into `ReviewPhoto`
 * (one row per photo) or a `{ error }` describing why the
 * payload was rejected. We deliberately keep the error in a
 * tagged union so the route handler can turn it into a 400
 * with a helpful message.
 */
export type NormalisePhotosResult =
  | { ok: true; photos: Array<{ url: string; thumbnail: string | null; sortOrder: number }> }
  | { ok: false; error: string };

/**
 * Accept either a list of URLs (the simple form: the client
 * uploaded via `POST /api/upload/image` and got back URLs) or
 * a list of `{ url, thumbnail, sortOrder }` objects (richer
 * form). Anything else is rejected.
 *
 * The route calls this with `body.photos` and treats a 400 on
 * failure.
 */
export function normaliseReviewPhotos(raw: unknown): NormalisePhotosResult {
  if (raw === undefined || raw === null) {
    return { ok: true, photos: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'photos must be an array' };
  }
  if (raw.length > MAX_REVIEW_PHOTOS) {
    return {
      ok: false,
      error: `A review can have at most ${MAX_REVIEW_PHOTOS} photos`,
    };
  }
  const out: Array<{ url: string; thumbnail: string | null; sortOrder: number }> = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as any;
    let url: string | null = null;
    let thumbnail: string | null = null;
    if (typeof item === 'string') {
      url = item;
    } else if (item && typeof item === 'object') {
      if (typeof item.url === 'string') url = item.url;
      if (typeof item.thumbnail === 'string') thumbnail = item.thumbnail;
    }
    if (!url) {
      return { ok: false, error: `photos[${i}].url is required` };
    }
    // Customer-supplied URLs are rendered into <img src> on the public
    // storefront: reject scriptable/data: schemes outright (defense in
    // depth — images from the upload endpoint are http(s) or relative).
    if (!isSafeLinkUrl(url) || (thumbnail !== null && !isSafeLinkUrl(thumbnail))) {
      return { ok: false, error: `photos[${i}].url must be http(s) or a relative path` };
    }
    out.push({ url, thumbnail, sortOrder: i });
  }
  return { ok: true, photos: out };
}

/**
 * Sort + sanitise the photos that come back from the database
 * for a storefront render. We sort by `sortOrder` ascending so
 * the upload order is preserved, and skip any rows that don't
 * have a `url` (defensive — should never happen because
 * `normaliseReviewPhotos` rejects empty URLs).
 */
export function orderReviewPhotos<
  T extends { url: string; sortOrder: number; thumbnail?: string | null },
>(photos: T[]): T[] {
  return [...photos]
    .filter((p) => Boolean(p.url))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
