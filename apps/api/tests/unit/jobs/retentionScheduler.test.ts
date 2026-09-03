/**
 * Retention scheduler.
 *
 * Unlike the marketing scheduler this one is ON by default, because keeping
 * personal data indefinitely is the unsafe state. That inversion is the main
 * thing worth pinning - along with the usual "must not overlap itself" and
 * "must not crash the process" properties of anything on a timer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockPurge = vi.fn();
vi.mock('../../../src/modules/analytics/retention', () => ({
  purgeOldEvents: (...args: unknown[]) => mockPurge(...args),
}));

const mockRunWithLock = vi.fn();
vi.mock('../../../src/jobs/distributedLock', () => ({
  runWithLock: (...args: unknown[]) => mockRunWithLock(...args),
}));

import {
  runOnce, startScheduler, stopScheduler, isEnabled, isDryRun,
} from '../../../src/jobs/retention-scheduler';

const ORIGINAL = { ...process.env };

beforeEach(() => {
  mockPurge.mockReset();
  mockPurge.mockResolvedValue({ days: 180, deleted: 7, truncated: false, dryRun: false });
  mockRunWithLock.mockReset();
  mockRunWithLock.mockImplementation(async (_n: string, _l: number, fn: () => any) => fn());
  delete process.env.ANALYTICS_RETENTION;
  delete process.env.ANALYTICS_RETENTION_DRY_RUN;
});

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();
  process.env = { ...ORIGINAL };
});

describe('enabled by default', () => {
  it('runs without any configuration', () => {
    // Retaining personal data forever is the unsafe state, so purging is the
    // default and a store must opt OUT.
    expect(isEnabled()).toBe(true);
  });

  it('is disabled only by the exact string "off"', () => {
    process.env.ANALYTICS_RETENTION = 'off';
    expect(isEnabled()).toBe(false);
  });

  it.each([['on'], ['true'], ['OFF'], ['0'], ['no'], ['']])(
    'stays enabled for ANALYTICS_RETENTION=%j',
    (v) => {
      // Anything ambiguous keeps the safe behaviour rather than silently
      // disabling compliance.
      process.env.ANALYTICS_RETENTION = v;
      expect(isEnabled()).toBe(true);
    },
  );

  it('does not schedule when disabled', () => {
    vi.useFakeTimers();
    process.env.ANALYTICS_RETENTION = 'off';
    startScheduler(1000);
    vi.advanceTimersByTime(60_000);
    expect(mockRunWithLock).not.toHaveBeenCalled();
  });
});

describe('dry run', () => {
  it('is off by default', () => {
    expect(isDryRun()).toBe(false);
  });

  it('requires the exact string "true"', () => {
    for (const v of ['1', 'yes', 'TRUE']) {
      process.env.ANALYTICS_RETENTION_DRY_RUN = v;
      expect(isDryRun(), v).toBe(false);
    }
    process.env.ANALYTICS_RETENTION_DRY_RUN = 'true';
    expect(isDryRun()).toBe(true);
  });

  it('passes dryRun through to the purge', async () => {
    process.env.ANALYTICS_RETENTION_DRY_RUN = 'true';
    await runOnce();
    expect(mockPurge).toHaveBeenCalledWith({ dryRun: true });
  });
});

describe('runOnce', () => {
  it('returns the deleted count', async () => {
    await expect(runOnce()).resolves.toEqual({ deleted: 7 });
  });

  it('swallows a purge failure rather than rejecting', async () => {
    // A rejection inside a timer becomes an unhandled rejection, which can
    // take the process down - for a cleanup job that is a terrible trade.
    mockPurge.mockRejectedValue(new Error('db gone'));
    await expect(runOnce()).resolves.toEqual({ deleted: 0 });
  });

  it('does not overlap with a purge already running', async () => {
    let release!: () => void;
    mockPurge.mockReturnValue(new Promise((r) => {
      release = () => r({ days: 180, deleted: 1, truncated: false, dryRun: false });
    }));

    const first = runOnce();
    expect(await runOnce()).toEqual({ deleted: 0 });
    expect(mockPurge).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('recovers after a failure', async () => {
    mockPurge.mockRejectedValueOnce(new Error('boom'));
    await runOnce();
    mockPurge.mockResolvedValue({ days: 180, deleted: 2, truncated: false, dryRun: false });
    expect(await runOnce()).toEqual({ deleted: 2 });
  });
});

describe('scheduling', () => {
  it('does not run on startup', () => {
    // A restart loop would otherwise hammer the table. Retention is measured
    // in months; a day's delay is irrelevant.
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(9_000);
    expect(mockRunWithLock).not.toHaveBeenCalled();
  });

  it('runs on each tick', () => {
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(30_000);
    expect(mockRunWithLock).toHaveBeenCalledTimes(3);
  });

  it('is idempotent', () => {
    vi.useFakeTimers();
    startScheduler(10_000);
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);
    expect(mockRunWithLock).toHaveBeenCalledTimes(1);
  });

  it('stops cleanly and can restart', () => {
    vi.useFakeTimers();
    startScheduler(10_000);
    stopScheduler();
    vi.advanceTimersByTime(50_000);
    expect(mockRunWithLock).not.toHaveBeenCalled();

    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);
    expect(mockRunWithLock).toHaveBeenCalledTimes(1);
  });

  it('does not keep the process alive', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(global, 'setInterval');
    startScheduler(10_000);
    expect(typeof spy.mock.results[0]?.value?.unref).toBe('function');
    spy.mockRestore();
  });
});

describe('distributed locking', () => {
  it('uses its own lock, not one shared with other jobs', () => {
    // Sharing a name would make retention and the marketing sweep block each
    // other for no reason.
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);

    const [name, lease] = mockRunWithLock.mock.calls[0];
    expect(name).toBe('analytics-retention');
    expect(name).not.toBe('abandoned-cart');
    expect(name).not.toBe('inventory');
    expect(lease).toBeGreaterThan(0);
  });

  it('skips when another instance holds the lock', async () => {
    mockRunWithLock.mockImplementation(async () => undefined);
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);
    await Promise.resolve();
    expect(mockPurge).not.toHaveBeenCalled();
  });
});
