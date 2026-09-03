/**
 * Abandoned-cart selection rules.
 *
 * The expensive mistakes here are all about WHO gets mailed. Mailing someone
 * who already bought, or who opted out, or mailing the same person the same
 * reminder twice, are each worse than not sending at all - they cost
 * deliverability for every other message the store sends.
 */
import { describe, it, expect } from 'vitest';
import {
  decideRecoveryEmail, selectRecoverable, hoursSince,
  STAGES, MAX_AGE_HOURS, MIN_CART_VALUE,
  type CartCandidate,
} from '../../../src/modules/marketing/abandonedCart.helpers';

const NOW = new Date('2026-03-01T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

function cart(over: Partial<CartCandidate> = {}): CartCandidate {
  return {
    userId: 'u1',
    email: 'a@b.com',
    updatedAt: hoursAgo(2),
    itemCount: 2,
    cartValue: 50,
    stagesSent: [],
    orderedSince: false,
    unsubscribed: false,
    ...over,
  };
}

describe('hoursSince', () => {
  it('measures elapsed hours', () => {
    expect(hoursSince(hoursAgo(3), NOW)).toBeCloseTo(3, 5);
  });
  it('is negative for a future timestamp', () => {
    expect(hoursSince(new Date(NOW.getTime() + 3600_000), NOW)).toBeCloseTo(-1, 5);
  });
});

describe('stage selection', () => {
  it('sends nothing before the first stage is due', () => {
    const d = decideRecoveryEmail(cart({ updatedAt: hoursAgo(0.5) }), NOW);
    expect(d).toEqual({ send: false, reason: 'no stage due' });
  });

  it('sends stage 1 once the cart is an hour old', () => {
    expect(decideRecoveryEmail(cart({ updatedAt: hoursAgo(1) }), NOW)).toEqual({ send: true, stage: 1 });
  });

  it('sends stage 2 after 24h', () => {
    expect(decideRecoveryEmail(cart({ updatedAt: hoursAgo(25), stagesSent: [1] }), NOW))
      .toEqual({ send: true, stage: 2 });
  });

  it('does not resend a stage already sent', () => {
    // The unique (userId, stage) constraint is the backstop, but the rule has
    // to hold here too or every sweep would attempt a duplicate write.
    expect(decideRecoveryEmail(cart({ updatedAt: hoursAgo(2), stagesSent: [1] }), NOW))
      .toEqual({ send: false, reason: 'no stage due' });
  });

  it('skips straight to stage 2 for a cart that is already old', () => {
    // A cart discovered at 30h should get the follow-up, not restart the
    // sequence with a "you just left this behind" message about yesterday.
    expect(decideRecoveryEmail(cart({ updatedAt: hoursAgo(30), stagesSent: [] }), NOW))
      .toEqual({ send: true, stage: 2 });
  });

  it('sends nothing once every stage is done', () => {
    expect(decideRecoveryEmail(cart({ updatedAt: hoursAgo(30), stagesSent: [1, 2] }), NOW))
      .toEqual({ send: false, reason: 'no stage due' });
  });

  it('covers every configured stage', () => {
    for (const { stage, afterHours } of STAGES) {
      const sent = STAGES.filter((s) => s.stage > stage).map((s) => s.stage);
      const d = decideRecoveryEmail(cart({ updatedAt: hoursAgo(afterHours), stagesSent: sent }), NOW);
      expect(d).toEqual({ send: true, stage });
    }
  });
});

describe('disqualifying conditions', () => {
  it('never mails someone who has since ordered', () => {
    // Otherwise the store thanks them for the order, then nags them about the
    // very same items.
    expect(decideRecoveryEmail(cart({ orderedSince: true, updatedAt: hoursAgo(5) }), NOW))
      .toEqual({ send: false, reason: 'ordered since' });
  });

  it('never mails someone who unsubscribed', () => {
    expect(decideRecoveryEmail(cart({ unsubscribed: true, updatedAt: hoursAgo(5) }), NOW))
      .toEqual({ send: false, reason: 'unsubscribed' });
  });

  it('opt-out wins even when a stage is due and the cart is valuable', () => {
    const d = decideRecoveryEmail(
      cart({ unsubscribed: true, updatedAt: hoursAgo(26), cartValue: 5000, stagesSent: [] }), NOW);
    expect(d.send).toBe(false);
  });

  it.each([[null], [undefined], ['']])('skips a user with email %j', (email) => {
    expect(decideRecoveryEmail(cart({ email: email as any, updatedAt: hoursAgo(5) }), NOW).send)
      .toBe(false);
  });

  it('skips an empty cart', () => {
    expect(decideRecoveryEmail(cart({ itemCount: 0, updatedAt: hoursAgo(5) }), NOW))
      .toEqual({ send: false, reason: 'empty cart' });
  });

  it('skips a cart below the value threshold', () => {
    expect(decideRecoveryEmail(cart({ cartValue: MIN_CART_VALUE - 0.01, updatedAt: hoursAgo(5) }), NOW))
      .toEqual({ send: false, reason: 'cart value below threshold' });
  });

  it('skips a cart older than the cutoff', () => {
    // "You left something behind" about a three-week-old cart reads as spam.
    expect(decideRecoveryEmail(cart({ updatedAt: hoursAgo(MAX_AGE_HOURS + 1) }), NOW))
      .toEqual({ send: false, reason: 'cart too old' });
  });

  it('still sends exactly at the cutoff boundary', () => {
    expect(decideRecoveryEmail(cart({ updatedAt: hoursAgo(MAX_AGE_HOURS), stagesSent: [1] }), NOW).send)
      .toBe(true);
  });

  it('refuses a cart timestamped in the future rather than treating it as fresh', () => {
    // Clock skew between app servers must not translate into a burst of
    // stage-1 emails.
    const future = new Date(NOW.getTime() + 3600_000);
    expect(decideRecoveryEmail(cart({ updatedAt: future }), NOW))
      .toEqual({ send: false, reason: 'cart timestamp in the future' });
  });
});

describe('selectRecoverable', () => {
  it('returns only the eligible carts, with their stage', () => {
    const carts = [
      cart({ userId: 'due1', updatedAt: hoursAgo(2) }),
      cart({ userId: 'tooNew', updatedAt: hoursAgo(0.2) }),
      cart({ userId: 'bought', updatedAt: hoursAgo(3), orderedSince: true }),
      cart({ userId: 'optedOut', updatedAt: hoursAgo(3), unsubscribed: true }),
      cart({ userId: 'due2', updatedAt: hoursAgo(26), stagesSent: [1] }),
    ];
    const out = selectRecoverable(carts, NOW);
    expect(out.map((o) => o.cart.userId)).toEqual(['due1', 'due2']);
    expect(out.map((o) => o.stage)).toEqual([1, 2]);
  });

  it('is empty when nothing qualifies', () => {
    expect(selectRecoverable([cart({ updatedAt: hoursAgo(0.1) })], NOW)).toEqual([]);
  });

  it('handles an empty input', () => {
    expect(selectRecoverable([], NOW)).toEqual([]);
  });
});
