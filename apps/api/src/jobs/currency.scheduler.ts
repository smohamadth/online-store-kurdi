/**
 * Currency refresh scheduler.
 *
 * Pulls exchange rates from open.er-api.com once a day and
 * updates every enabled Currency row that the admin hasn't
 * pinned (`manuallySet: false`). Same shape as the inventory
 * scheduler: a setInterval loop with a process.unref so the
 * tick doesn't keep the API alive. Disable with
 * CURRENCY_SCHEDULER=off for tests.
 *
 * Every tick is guarded by a database-backed distributed lock
 * (see jobs/distributedLock.ts), so multiple API instances behind a
 * load balancer still fetch rates exactly once per interval.
 *
 * Why one tick per day? Open-ER updates rates roughly every
 * hour, but pulling more often wastes egress for what the
 * storefront sees as "USD 10.99". Daily is the right
 * resolution: prices in another currency may be a few
 * hundredths off for at most 24h, which is the same
 * precision a credit-card processor applies.
 */
import { refreshRates } from '../modules/currency/currency.routes';
import { tryAcquireLock } from './distributedLock';
import { logger } from '../utils/logger';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

const LOCK_NAME = 'currency';
const LOCK_LEASE_MS = DEFAULT_INTERVAL_MS + 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const summary = await refreshRates();
    logger.info(
      `[currency-scheduler] base=${summary.base} fetched=${summary.fetched} skipped=${summary.skipped}` +
        (summary.errors.length ? ` errors=${summary.errors.join('; ')}` : ''),
    );
  } catch (err: any) {
    logger.error(`[currency-scheduler] failed: ${err?.message ?? err}`);
  } finally {
    running = false;
  }
}

/**
 * One scheduled tick: take the distributed lock and, if we win it, refresh the
 * rates. Losing the lock means another API instance already ran this tick.
 */
async function tick(): Promise<void> {
  const lock = await tryAcquireLock(LOCK_NAME, LOCK_LEASE_MS);
  if (!lock) {
    logger.info('[currency-scheduler] another instance holds the lock; skipping this tick');
    return;
  }
  try {
    await runOnce();
  } finally {
    await lock.release();
  }
}

export function startScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (process.env.CURRENCY_SCHEDULER === 'off') {
    logger.info('[currency-scheduler] disabled via CURRENCY_SCHEDULER=off');
    return;
  }
  if (timer) return;
  logger.info(`[currency-scheduler] starting; tick=${intervalMs}ms`);
  // First run on a short delay so the server has time to
  // finish its startup logging before the fetch kicks off.
  setTimeout(() => { tick(); }, 30_000);
  timer = setInterval(() => { tick(); }, intervalMs);
  if (timer.unref) timer.unref();
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
