// ---------------------------------------------------------------------------
// Distributed lock (DB lease) for the in-process schedulers.
//
// The inventory and currency schedulers are plain per-process setInterval
// loops. Run N API replicas behind a load balancer and each one fires its own
// copy of the job per interval - double-running reorder drafts, reservation
// releases and currency-rate fetches. Pinning exactly one process as "the
// worker" or moving to external cron are the classic answers; this module
// gives a third, self-contained one:
//
//   A database-backed lease. Each job has one row (ScheduledJobLock). A tick
//   can only become the owner if the row is free or its lease has expired, and
//   the ownership handover is one atomic conditional updateMany - so two
//   processes can never both win the same tick. If the owner crashes without
//   releasing, the lease auto-expires and a later tick takes over.
//
// Works on both the SQLite and Postgres providers (conditional updateMany is
// supported by each). Redis is deliberately NOT used as the lock store: it is
// optional in this app and fails soft, so it cannot be the single source of
// truth for "did this job run yet".
// ---------------------------------------------------------------------------
import { randomUUID } from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// An epoch timestamp means "released / free". Using a timestamp instead of
// null keeps the "is it free?" check a single comparison and avoids null
// indexing quirks across providers.
const LOCK_RELEASED = new Date(0);

export interface DistributedLock {
  /** Opaque owner token. Pass to release() to free the lock. */
  readonly token: string;
  /** Free the lease, but only if we still own it. */
  release(): Promise<void>;
}

/** Make sure a row exists for the job name so the conditional update has a row to claim. */
async function ensureRow(name: string): Promise<void> {
  try {
    await prisma.scheduledJobLock.upsert({
      where: { name },
      update: {},
      create: { name, token: '', heldUntil: LOCK_RELEASED },
    });
  } catch (err) {
    // A concurrent first-insert can hit a unique violation on Postgres. The
    // row now exists (someone else just created it), which is all we needed.
    logger.warn(
      `[distributed-lock] upsert race for "${name}": ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Try to acquire the named lease. Returns a handle to release it, or null if
 * another process currently holds it.
 *
 * `leaseMs` is how long the lease lives before it auto-expires. It should be
 * comfortably longer than the job's worst-case duration (so a slow run is not
 * stolen mid-flight) but short enough that a crashed owner frees the job in a
 * reasonable time.
 */
export async function tryAcquireLock(name: string, leaseMs: number): Promise<DistributedLock | null> {
  const token = randomUUID();
  const heldUntil = new Date(Date.now() + leaseMs);
  await ensureRow(name);

  // Claim only if the lease is free or already expired. A free row always has
  // an epoch (past) heldUntil, and a held row has a future one, so a single
  // "heldUntil in the past" guard is both sufficient and correct. The `name`
  // filter plus this timestamp guard make the claim atomic: only one
  // concurrent updateMany can match, so only one caller becomes the owner.
  const res = await prisma.scheduledJobLock.updateMany({
    where: {
      name,
      heldUntil: { lt: new Date() },
    },
    data: { token, heldUntil },
  });
  if (res.count !== 1) return null;

  return {
    token,
    async release() {
      // Free only if we still own it - never clobber a renewed/other owner.
      await prisma.scheduledJobLock.updateMany({
        where: { name, token },
        data: { heldUntil: LOCK_RELEASED },
      });
    },
  };
}

/**
 * Run `fn` while holding the named lock, or skip if another instance holds it.
 *
 * This is the safe entry point for scheduler ticks: it NEVER throws, so a
 * transient database outage (or a job failure) logs a warning instead of
 * turning the setInterval/setTimeout callback into an unhandled rejection
 * (which would crash the process). The scheduler's self-contained, never-crash
 * contract is preserved even though a DB round-trip now happens every tick.
 *
 * @returns true if this process ran the job, false if it was skipped (lock
 *   held elsewhere, or an error prevented the run).
 */
export async function runWithLock<T>(
  name: string,
  leaseMs: number,
  fn: () => Promise<T>,
): Promise<boolean> {
  let lock: DistributedLock | null = null;
  try {
    lock = await tryAcquireLock(name, leaseMs);
  } catch (err) {
    logger.error(
      `[distributed-lock] "${name}" acquire failed; skipping tick: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }

  if (!lock) {
    // Another process already won this tick.
    return false;
  }

  try {
    await fn();
    return true;
  } catch (err) {
    logger.error(
      `[distributed-lock] job "${name}" failed: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  } finally {
    try {
      await lock.release();
    } catch (err) {
      logger.error(
        `[distributed-lock] "${name}" release failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
