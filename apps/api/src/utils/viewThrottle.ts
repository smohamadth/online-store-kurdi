/**
 * In-memory per-key throttle for public view counters.
 *
 * The blog view-bump endpoint is public and unauthenticated. Without a
 * throttle a bot (or a hot-loop client) can flood it with UPDATEs —
 * on a single-instance SQLite deployment every request queues on the
 * writer, so that is a genuine write-DoS vector, and on any deployment
 * it inflates the vanity counter without bound. One increment per key
 * per window keeps real traffic honest (each browser fires once per
 * page load) with no shared rate-limiter infrastructure.
 *
 * Per-process state: each API instance bumps at most once per window
 * per key, which is fine — the counter is a display metric.
 */
const lastBump = new Map<string, number>();

/** True when the key may bump now; false if it bumped within `windowMs`. */
export function viewBumpAllowed(key: string, windowMs = 60_000): boolean {
  const now = Date.now();
  const prev = lastBump.get(key) ?? 0;
  if (now - prev < windowMs) return false;
  // Keep the map bounded on a long-lived process with many distinct keys.
  if (lastBump.size > 10_000) {
    for (const [k, t] of lastBump) {
      if (now - t > windowMs * 10) lastBump.delete(k);
    }
  }
  lastBump.set(key, now);
  return true;
}
