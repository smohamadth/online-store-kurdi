import crypto from 'node:crypto';

/**
 * Compute a real X-Signature for the 3PL webhook.
 *
 * These tests used to send a literal `'somesig'` and still get a 200, because
 * the route passed `mockAccept: NODE_ENV !== 'production'` and mockAccept
 * accepts ANY non-empty signature. The tests were therefore asserting the
 * bypass rather than the authentication, and would have kept passing if
 * signature checking were removed altogether.
 *
 * The route verifies the HMAC over `req.rawBody` - the exact bytes on the
 * wire - so we sign `JSON.stringify(body)`, which is what supertest's
 * `.send(object)` transmits.
 */
export function signWebhookBody(secret: string, body: unknown): string {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
}
