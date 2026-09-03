/**
 * Abandoned-cart selection rules.
 *
 * Pure and prisma-free so the decision logic can be exhaustively unit-tested:
 * the expensive mistakes here are all "who gets mailed", not "how the query is
 * written". Emailing the wrong person is a spam complaint, and emailing the
 * same person twice is worse.
 */

/** A cart considered for recovery, reduced to just what the rules need. */
export type CartCandidate = {
  userId: string;
  email: string | null | undefined;
  /** Most recent change to any line in the cart. */
  updatedAt: Date;
  itemCount: number;
  cartValue: number;
  /** Stages already mailed to this user (from AbandonedCartEmail). */
  stagesSent: number[];
  /** True if the user has an order placed after the cart was last touched. */
  orderedSince: boolean;
  /** True if the user opted out of marketing email. */
  unsubscribed: boolean;
};

/** Reminder schedule: first nudge after 1h, follow-up after 24h. */
export const STAGES = [
  { stage: 1, afterHours: 1 },
  { stage: 2, afterHours: 24 },
] as const;

/**
 * Never mail a cart older than this. Someone who abandoned a cart three weeks
 * ago has moved on, and a "you left something behind" email about a
 * long-forgotten cart reads as spam - which costs deliverability for every
 * other message the store sends.
 */
export const MAX_AGE_HOURS = 72;

/** Carts below this value are not worth an email (and its spam risk). */
export const MIN_CART_VALUE = 1;

export type Decision =
  | { send: false; reason: string }
  | { send: true; stage: number };

const HOUR = 60 * 60 * 1000;

export function hoursSince(then: Date, now: Date): number {
  return (now.getTime() - new Date(then).getTime()) / HOUR;
}

/**
 * Decide whether (and at which stage) a cart should be mailed.
 *
 * Order matters: the disqualifying checks run before the stage selection so a
 * user who has since ordered, or opted out, is never mailed regardless of how
 * their timings line up.
 */
export function decideRecoveryEmail(cart: CartCandidate, now: Date = new Date()): Decision {
  if (!cart.email) return { send: false, reason: 'no email address' };

  // Opt-out beats everything. A recovery email is marketing, and mailing
  // someone who unsubscribed is exactly the complaint that gets a sending
  // domain blocklisted.
  if (cart.unsubscribed) return { send: false, reason: 'unsubscribed' };

  // The cart is not abandoned if they went on to buy. Without this the store
  // thanks a customer for their order and then nags them about the same items.
  if (cart.orderedSince) return { send: false, reason: 'ordered since' };

  if (cart.itemCount <= 0) return { send: false, reason: 'empty cart' };
  if (cart.cartValue < MIN_CART_VALUE) return { send: false, reason: 'cart value below threshold' };

  const age = hoursSince(cart.updatedAt, now);

  // Guard against clock skew / future timestamps rather than treating a
  // negative age as "very fresh" and mailing at stage 1 immediately.
  if (age < 0) return { send: false, reason: 'cart timestamp in the future' };
  if (age > MAX_AGE_HOURS) return { send: false, reason: 'cart too old' };

  // Walk the schedule newest-first so a cart that is already 30h old gets the
  // stage-2 follow-up rather than starting the sequence from scratch.
  for (const { stage, afterHours } of [...STAGES].reverse()) {
    if (age >= afterHours && !cart.stagesSent.includes(stage)) {
      return { send: true, stage };
    }
  }

  return { send: false, reason: 'no stage due' };
}

/** Convenience wrapper used by the sweep. */
export function selectRecoverable(carts: CartCandidate[], now: Date = new Date()) {
  const out: Array<{ cart: CartCandidate; stage: number }> = [];
  for (const cart of carts) {
    const d = decideRecoveryEmail(cart, now);
    if (d.send) out.push({ cart, stage: d.stage });
  }
  return out;
}
