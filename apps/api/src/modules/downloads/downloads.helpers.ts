/**
 * Pure helpers for the digital-download module.
 *
 * The download module is small but every line is a security
 * boundary: the route accepts an unguessable token and has to
 * decide, in code that runs before any I/O, whether the customer
 * is allowed to download RIGHT NOW. Centralising the decision
 * logic here means a unit test can pin every branch:
 *
 *   - isTokenValid:       the four "this token is fine" predicates
 *   - canRedeem:          the single combined predicate
 *   - generateDownloadToken: 32 random bytes, base64url-encoded
 *   - computeExpiry:     order-placement-time expiry calculation
 *   - remainingDownloads: how many of N the customer has left
 *
 * The route handler is in downloads.routes.ts; it just reads the
 * DB and calls these helpers. Splitting them out keeps the route
 * thin and the security logic testable in isolation.
 */

import crypto from 'node:crypto';

/** Base64url (no `+`/`/`/`=`) of 32 random bytes -> 43 chars. We
 *  use 32 bytes (256 bits) so a brute force is infeasible even
 *  if a token leaks. */
export function generateDownloadToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * A token is redeemable if all four predicates hold:
 *   - it exists (caller passes a row; we just check the row)
 *   - it has not yet hit the per-token download limit
 *   - it has not expired
 *   - the product-level (OrderItem.downloadCount/downloadLimit) cap
 *     has not yet been hit (legacy single-URL flow)
 *
 * Inputs are normalised to numbers first so a `null` from
 * Prisma doesn't slip through. expiresAt is `null` when no
 * expiry was set - that's the "never expires" case.
 */
export interface TokenStatusInput {
  /** Per-token count, already incremented by the route if it's
   *  about to commit. */
  downloadCount: number | null | undefined;
  /** Per-token limit. Null / undefined = unlimited. */
  downloadLimit: number | null | undefined;
  /** Per-token expiry. Null = never expires. */
  expiresAt: Date | string | null | undefined;
  /** OrderItem.downloadCount - product-level counter. */
  productDownloadCount: number | null | undefined;
  /** OrderItem.downloadLimit - product-level limit. */
  productDownloadLimit: number | null | undefined;
}

export interface TokenStatus {
  ok: boolean;
  /** Why not, when ok=false. Useful for a 410 (gone) vs 429
   *  (too many requests) response. */
  reason?: 'not_found' | 'expired' | 'limit_exceeded' | 'product_limit_exceeded' | 'unpaid';
}

export function isExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return exp.getTime() <= now.getTime();
}

export function limitReached(
  count: number | null | undefined,
  limit: number | null | undefined,
): boolean {
  // Null / undefined = unlimited.
  if (limit === null || limit === undefined) return false;
  if (limit <= 0) return false;
  const c = count ?? 0;
  return c >= limit;
}

export function tokenStatus(input: TokenStatusInput, now: Date = new Date()): TokenStatus {
  if (isExpired(input.expiresAt, now)) {
    return { ok: false, reason: 'expired' };
  }
  if (limitReached(input.downloadCount, input.downloadLimit)) {
    return { ok: false, reason: 'limit_exceeded' };
  }
  if (limitReached(input.productDownloadCount, input.productDownloadLimit)) {
    return { ok: false, reason: 'product_limit_exceeded' };
  }
  return { ok: true };
}

/** How many downloads the customer has left. Negative if the
 *  limit is 0 (which we treat as "blocked, not unlimited"). */
export function remainingDownloads(
  count: number | null | undefined,
  limit: number | null | undefined,
): number {
  if (limit === null || limit === undefined) return Infinity;
  if (limit <= 0) return 0;
  return Math.max(0, limit - (count ?? 0));
}

/** Compute the per-token expiry at order-placement time.
 *
 *  `Product.downloadExpiry` is a number of DAYS (the schema is
 *  "days after purchase"). Returns null when:
 *    - the product has no expiry set (downloadExpiry is null/0)
 *    - the input is invalid
 *
 *  Always uses "now" as the base, so the route can pass the
 *  order's createdAt for stable tests.
 */
export function computeExpiry(
  daysFromPurchase: number | null | undefined,
  purchaseDate: Date = new Date(),
): Date | null {
  if (daysFromPurchase === null || daysFromPurchase === undefined) return null;
  if (!Number.isFinite(daysFromPurchase) || daysFromPurchase <= 0) return null;
  const ms = daysFromPurchase * 24 * 60 * 60 * 1000;
  return new Date(purchaseDate.getTime() + ms);
}
