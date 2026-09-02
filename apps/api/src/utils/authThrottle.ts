/**
 * In-memory brute-force throttle for public auth endpoints.
 *
 * /login, /forgot-password and /reset-password are public, and login
 * runs bcrypt.compare per attempt — an attacker hammering them burns
 * CPU on the API process (bcrypt is deliberately expensive) and,
 * worse, can grind through passwords without any back-off. The
 * lockout here is per attempted identity AND per source IP:
 *
 *   - 5 failed attempts against the same email within 15 minutes
 *     locks that email for 15 minutes (even if the email doesn't
 *     exist — the key is the attempted string, never account state,
 *     so the lockout itself cannot be used to probe which accounts
 *     exist);
 *   - 20 failed attempts from the same IP within 15 minutes lock the
 *     IP for 15 minutes (a distributed-guess mitigation; the identity
 *     check still runs for legitimate users behind a shared IP).
 *
 * Forgot-password and reset-password are write/email endpoints; the
 * same per-email + per-IP windows cap mailbox bombing and token spam.
 *
 * Per-process state: on a multi-instance deployment each instance
 * keeps its own counters, which only softens the cap. The windows are
 * short and the counter is a safety net, not a security boundary.
 */
const FAILED = new Map<string, { count: number; until: number }>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_EMAIL_FAILURES = 5;
const MAX_IP_FAILURES = 20;

function key(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/** Record a failure; returns true when the identity is now locked out. */
export function recordAuthFailure(kind: 'email' | 'ip', id: string): boolean {
  const k = key(kind, id);
  const now = Date.now();
  const prev = FAILED.get(k);
  // A fresh window starts when the previous one has expired (until=0
  // means "not locked", so a merely-counted identity resumes counting).
  const active = prev && (prev.until === 0 || prev.until > now);
  const count = active ? prev.count + 1 : 1;
  const max = kind === 'email' ? MAX_EMAIL_FAILURES : MAX_IP_FAILURES;
  FAILED.set(k, {
    count,
    // until stays 0 until the threshold is crossed: isAuthLocked must
    // only be true once the identity is actually locked out.
    until: count >= max ? now + WINDOW_MS : 0,
  });
  return count >= max;
}

/** True while the identity is locked out. */
export function isAuthLocked(kind: 'email' | 'ip', id: string): boolean {
  const prev = FAILED.get(key(kind, id));
  return !!prev && prev.until > Date.now();
}

/** Clear the failure counter for an identity (after a successful login). */
export function clearAuthFailures(kind: 'email' | 'ip', id: string): void {
  FAILED.delete(key(kind, id));
}

/** Prune expired entries so the map cannot grow without bound. */
export function pruneAuthFailures(): void {
  const now = Date.now();
  if (FAILED.size <= 10_000) return;
  for (const [k, v] of FAILED) {
    if (v.until <= now) FAILED.delete(k);
  }
}

/** Reset all state (test helper). */
export function resetAuthThrottle(): void {
  FAILED.clear();
}
