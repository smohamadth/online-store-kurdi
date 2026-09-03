/**
 * Pure helpers for newsletter consent handling.
 *
 * Deliberately free of prisma/express imports so they can be unit-tested
 * standalone (importing a prisma-touching module in a unit test fails with
 * "Cannot find module '.prisma/client/default'").
 */
import crypto from 'crypto';

/** Subscription states. Unsubscribing is a status change, never a delete. */
export const SUBSCRIBED = 'subscribed';
export const UNSUBSCRIBED = 'unsubscribed';

/** Where an address was collected. Recorded as consent evidence. */
export const VALID_SOURCES = ['footer', 'checkout', 'popup', 'inline', 'import', 'legacy'] as const;
export type NewsletterSource = (typeof VALID_SOURCES)[number];

export function normalizeSource(input: unknown): NewsletterSource {
  const s = String(input ?? '').trim().toLowerCase();
  return (VALID_SOURCES as readonly string[]).includes(s) ? (s as NewsletterSource) : 'footer';
}

/**
 * Opaque unsubscribe token.
 *
 * Must be unguessable: anyone holding a token can unsubscribe that address
 * without authenticating (one-click unsubscribe is a legal requirement, and
 * mail clients follow the link without a session). A sequential id or a hash
 * of the email would let an attacker unsubscribe arbitrary customers, so this
 * is 32 bytes of CSPRNG output.
 */
export function generateUnsubscribeToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Email addresses are case-insensitive mailboxes. Storing the raw form lets
 * 'A@X.com' and 'a@x.com' become two rows - two copies of every mailing, and
 * an unsubscribe that only silences one of them.
 */
export function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Truncate an IP for consent logging.
 *
 * Re-exported from utils/redact so there is ONE definition. Two copies of a
 * privacy control drift, and the drift is silent: analytics was storing full
 * IPs while this module truncated them.
 */
export { truncateIp } from '../../utils/redact';


/**
 * Build the one-click unsubscribe URL placed in every marketing email.
 * Kept here so the link format is defined in exactly one place.
 */
export function buildUnsubscribeUrl(baseUrl: string, token: string): string {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return `${base}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Decide what a subscribe request should do for an existing row.
 *
 * Pulled out as a pure function because the resubscribe case is the subtle
 * one: someone who previously opted out and then deliberately signs up again
 * is giving fresh consent, so they must be reactivated AND re-stamped - but a
 * duplicate signup from someone already subscribed must not overwrite the
 * original consent timestamp, which is the evidence of when they first
 * agreed.
 */
export type SubscribeDecision =
  | { action: 'create' }
  | { action: 'noop' }
  | { action: 'resubscribe' };

export function decideSubscribe(
  existing: { status: string } | null | undefined,
): SubscribeDecision {
  if (!existing) return { action: 'create' };
  if (existing.status === UNSUBSCRIBED) return { action: 'resubscribe' };
  return { action: 'noop' };
}
