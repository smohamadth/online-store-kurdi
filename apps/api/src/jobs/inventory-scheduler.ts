/**
 * Inventory scheduler.
 *
 * Runs the auto-reorder and reservation-release jobs on a fixed
 * interval (default: every 5 minutes). In production this would be
 * backed by node-cron or a real scheduler; here we use a setInterval
 * so the API runs self-contained without external dependencies.
 *
 * Every tick is guarded by a database-backed distributed lock
 * (see jobs/distributedLock.ts) so that running more than one API
 * instance behind a load balancer still runs the job exactly once -
 * the other instances observe the held lease and skip.
 *
 * To disable scheduling entirely, set INVENTORY_SCHEDULER=off in the
 * environment before importing this module.
 */
import { runAutoReorder, releaseExpiredReservations } from '../modules/inventory/inventory.service';
import { runWithLock } from './distributedLock';
import { logger } from '../utils/logger';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Lease the lock for slightly longer than the interval: a slow run is never
// stolen mid-flight, and a crashed owner frees the job by the next tick.
const LOCK_NAME = 'inventory';
const LOCK_LEASE_MS = DEFAULT_INTERVAL_MS + 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runOnce(): Promise<{ releasedReservations: number; draftsCreated: number }> {
  if (running) {
    // Avoid overlapping runs if a tick fires while a previous one
    // is still in flight (large reorder drafts can take seconds).
    return { releasedReservations: 0, draftsCreated: 0 };
  }
  running = true;
  try {
    const released = await releaseExpiredReservations();
    const reorder = await runAutoReorder({ dryRun: false });
    logger.info(`[inventory-scheduler] released=${released} drafts=${reorder.draftsCreated} scanned=${reorder.scanned}`);
    return { releasedReservations: released, draftsCreated: reorder.draftsCreated };
  } catch (err: any) {
    logger.error(`[inventory-scheduler] failed: ${err?.message ?? err}`);
    return { releasedReservations: 0, draftsCreated: 0 };
  } finally {
    running = false;
  }
}

/**
 * One scheduled tick: run the job under the distributed lock. runWithLock
 * never throws - a DB outage or job failure is logged, and a lock held by
 * another instance skips this tick - so the timer callback can never turn
 * into an unhandled rejection.
 */
async function tick(): Promise<void> {
  await runWithLock(LOCK_NAME, LOCK_LEASE_MS, () => runOnce());
}

export function startScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (process.env.INVENTORY_SCHEDULER === 'off') {
    logger.info('[inventory-scheduler] disabled via INVENTORY_SCHEDULER=off');
    return;
  }
  if (timer) return;
  logger.info(`[inventory-scheduler] starting; tick=${intervalMs}ms`);
  // Run once on startup so a freshly-deployed process catches up
  // on expired reservations / new drafts without waiting for the
  // first interval.
  setTimeout(() => { tick(); }, 5_000);
  timer = setInterval(() => { tick(); }, intervalMs);
  if (timer.unref) timer.unref(); // don't keep the process alive just for this
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
