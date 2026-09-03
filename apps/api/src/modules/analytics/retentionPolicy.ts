/**
 * Analytics data retention POLICY (pure).
 *
 * Deliberately free of prisma/logger imports so it can be unit-tested
 * standalone - importing a prisma-touching module in a unit test fails with
 * "Cannot find module '.prisma/client/default'". The I/O lives in
 * retention.ts.
 *
 * UserEvent rows accumulate forever: one per view, search, add-to-cart and
 * purchase, each carrying a session id, user agent and (truncated) IP. That is
 * behavioural data about identifiable customers, and "we keep it indefinitely
 * because nobody wrote a delete" is not a retention policy - GDPR expects
 * personal data to be kept only as long as it is needed.
 *
 * It is also an operational problem: the table is the fastest-growing one in
 * the schema and nothing bounded it.
 *
 * The policy decisions are pure functions so they can be tested without a
 * database; the sweep below is the I/O around them.
 */
/**
 * Default window. Long enough for the reporting the store actually does -
 * the funnel and dashboard both look at 30 days by default, and trending
 * looks at less - with a wide margin for year-on-year curiosity.
 */
export const DEFAULT_RETENTION_DAYS = 180;

/** Never allow a policy so short it silently destroys current reporting. */
export const MIN_RETENTION_DAYS = 7;
/** Nor one so long it is indistinguishable from keeping everything. */
export const MAX_RETENTION_DAYS = 3650;

/**
 * Resolve the configured retention window.
 *
 * Invalid or out-of-range input falls back to the default rather than
 * throwing: a typo in an env var must not stop the API booting, and it
 * certainly must not be read as "delete everything".
 */
export function resolveRetentionDays(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  const floored = Math.floor(n);
  if (floored < MIN_RETENTION_DAYS) return DEFAULT_RETENTION_DAYS;
  if (floored > MAX_RETENTION_DAYS) return MAX_RETENTION_DAYS;
  return floored;
}

/** The timestamp before which events are eligible for deletion. */
export function retentionCutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Is this purge safe to run?
 *
 * Guards the two ways a retention job destroys data it should not: a cutoff
 * in the future (which would delete everything) and a non-positive window.
 */
export function isSafeCutoff(cutoff: Date, now: Date = new Date()): boolean {
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) return false;
  // A cutoff at or after "now" means "delete all history".
  return cutoff.getTime() < now.getTime();
}
