/**
 * Data-retention scheduler.
 *
 * Deletes analytics events past their retention window on a daily tick.
 *
 * Separate from the marketing scheduler on purpose. That one is opt-in
 * because it emails customers; this one deletes data the store has no reason
 * to keep, which is a compliance obligation rather than a feature. Tying
 * retention to a marketing switch would mean a store that never enables
 * marketing also never purges - the worst combination.
 *
 * Guarded by the same distributed lock as the other jobs, so several API
 * instances behind a load balancer purge once rather than racing each other
 * through the same batches.
 */
import { purgeOldEvents } from '../modules/analytics/retention';
import { runWithLock } from './distributedLock';
import { logger } from '../utils/logger';

/** Daily. Retention is measured in months; a faster tick is pointless work. */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

const LOCK_NAME = 'analytics-retention';
// Lease longer than the interval so a slow purge is never stolen mid-run.
const LOCK_LEASE_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * ON by default, unlike the marketing scheduler.
 *
 * Retaining personal data indefinitely is the unsafe state, so the safe
 * default is to purge. ANALYTICS_RETENTION=off disables it for a store that
 * manages retention externally (a DBA-run job, a warehouse export).
 */
export function isEnabled(): boolean {
  return process.env.ANALYTICS_RETENTION !== 'off';
}

/** Report what would be deleted without deleting it. */
export function isDryRun(): boolean {
  return process.env.ANALYTICS_RETENTION_DRY_RUN === 'true';
}

export async function runOnce(): Promise<{ deleted: number }> {
  if (running) return { deleted: 0 };
  running = true;
  try {
    const result = await purgeOldEvents({ dryRun: isDryRun() });
    return { deleted: result.deleted };
  } catch (err: any) {
    // A purge failure must never take the process down - the data is simply
    // still there and the next tick retries.
    logger.error(`[retention-scheduler] failed: ${err?.message ?? err}`);
    return { deleted: 0 };
  } finally {
    running = false;
  }
}

async function tick(): Promise<void> {
  await runWithLock(LOCK_NAME, LOCK_LEASE_MS, () => runOnce());
}

export function startScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (!isEnabled()) {
    logger.info('[retention-scheduler] disabled via ANALYTICS_RETENTION=off');
    return;
  }
  if (timer) return;

  logger.info(
    `[retention-scheduler] starting; tick=${intervalMs}ms${isDryRun() ? ' DRY RUN' : ''}`,
  );

  // No catch-up run on startup. A restart loop would otherwise hammer the
  // table, and retention is measured in months - a day's delay is irrelevant.
  timer = setInterval(() => { tick(); }, intervalMs);
  if (timer.unref) timer.unref();
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
