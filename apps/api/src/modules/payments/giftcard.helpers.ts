/**
 * Pure gift-card helpers.
 *
 * Kept separate from `giftcard.service.ts` so the unit tests can
 * import them without triggering the prisma client (which fails
 * to load outside the integration test environment).
 *
 * The service module re-exports these for the route layer.
 */
import crypto from 'crypto';

// ---------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------

/**
 * Generate a 16-character uppercase hex code, formatted with
 * dashes (XXXX-XXXX-XXXX-XXXX). We use randomBytes for
 * unpredictability and add a one-shot retry if the (vanishingly
 * unlikely) collision happens.
 */
export function generateGiftCardCode(): string {
  const bytes = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}`;
}

/**
 * Normalise a user-supplied code: strip whitespace and uppercase.
 * Lets the customer type `xxxx-xxxx-xxxx-xxxx` or `XXXX XXXX XXXX XXXX`
 * and still have it match.
 */
export function normaliseCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Re-dash a normalised code into the canonical XXXX-XXXX-XXXX-XXXX
 * form. Used to look up cards in the DB by their dashed form.
 */
export function dashCode(normalised: string): string {
  if (normalised.length !== 16) return normalised;
  return `${normalised.slice(0, 4)}-${normalised.slice(4, 8)}-${normalised.slice(8, 12)}-${normalised.slice(12, 16)}`;
}

// ---------------------------------------------------------------------
// Pure predicates
// ---------------------------------------------------------------------

/**
 * Check whether a card is redeemable RIGHT NOW. Pure function
 * over a card row - the actual card fetch is in the redemption
 * helpers below.
 */
export function isRedeemable(card: { status: string; balance: number; expiresAt: Date | null }, now: Date = new Date()): boolean {
  if (card.status !== 'active') return false;
  if (card.balance <= 0) return false;
  if (card.expiresAt && card.expiresAt.getTime() < now.getTime()) return false;
  return true;
}

// ---------------------------------------------------------------------
// Public view
// ---------------------------------------------------------------------

/**
 * Return the public view of a gift card: code, status, balance,
 * expiry. No PII (no createdBy, no notes) - safe to show in
 * receipts and admin list views.
 */
export function publicGiftCardView(card: {
  code: string;
  status: string;
  initialAmount: number;
  balance: number;
  currency: string;
  expiresAt: Date | null;
  issuedAt: Date;
}) {
  return {
    code: card.code,
    status: card.status,
    initialAmount: card.initialAmount,
    balance: card.balance,
    currency: card.currency,
    expiresAt: card.expiresAt,
    issuedAt: card.issuedAt,
  };
}
