/**
 * Marketing scheduler.
 *
 * This is the component that decides, unattended, to email customers. The
 * failure modes are asymmetric: not sending costs a recoverable cart, but
 * sending when the operator did not ask - or sending twice - damages the
 * store's sending reputation and every transactional email it depends on.
 * So the safety properties are what these pin.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockSweep = vi.fn();
vi.mock('../../../src/modules/marketing/abandonedCart.service', () => ({
  runAbandonedCartSweep: (...args: unknown[]) => mockSweep(...args),
}));

const mockRunWithLock = vi.fn();
vi.mock('../../../src/jobs/distributedLock', () => ({
  runWithLock: (...args: unknown[]) => mockRunWithLock(...args),
}));

import {
  runOnce, startScheduler, stopScheduler, isEnabled, isDryRun,
} from '../../../src/jobs/marketing-scheduler';

const ORIGINAL = { ...process.env };

beforeEach(() => {
  mockSweep.mockReset();
  mockSweep.mockResolvedValue({ considered: 3, sent: 2, skipped: {}, errors: 0 });
  mockRunWithLock.mockReset();
  // By default let the lock through so the wrapped job actually runs.
  mockRunWithLock.mockImplementation(async (_n: string, _l: number, fn: () => any) => fn());
  delete process.env.ABANDONED_CART_SCHEDULER;
  delete process.env.ABANDONED_CART_DRY_RUN;
});

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();
  process.env = { ...ORIGINAL };
});

describe('opt-in gate', () => {
  it('is OFF when the variable is unset', () => {
    // Upgrading must never silently start emailing a store's customers.
    expect(isEnabled()).toBe(false);
  });

  it.each([['off'], ['false'], ['0'], [''], ['ON'], ['yes'], ['true']])(
    'stays off for ABANDONED_CART_SCHEDULER=%j',
    (v) => {
      // Only the exact string 'on' enables it - no fuzzy truthiness, because
      // a typo must fail closed.
      process.env.ABANDONED_CART_SCHEDULER = v;
      expect(isEnabled()).toBe(false);
    },
  );

  it('is on only for the exact string "on"', () => {
    process.env.ABANDONED_CART_SCHEDULER = 'on';
    expect(isEnabled()).toBe(true);
  });

  it('startScheduler does nothing while disabled', () => {
    vi.useFakeTimers();
    startScheduler(1000);
    vi.advanceTimersByTime(60_000);
    expect(mockRunWithLock).not.toHaveBeenCalled();
    expect(mockSweep).not.toHaveBeenCalled();
  });
});

describe('dry run', () => {
  it('is off by default', () => {
    expect(isDryRun()).toBe(false);
  });

  it('requires the exact string "true"', () => {
    for (const v of ['1', 'yes', 'TRUE', 'on']) {
      process.env.ABANDONED_CART_DRY_RUN = v;
      expect(isDryRun(), `value ${v}`).toBe(false);
    }
    process.env.ABANDONED_CART_DRY_RUN = 'true';
    expect(isDryRun()).toBe(true);
  });

  it('passes dryRun through to the sweep', async () => {
    process.env.ABANDONED_CART_DRY_RUN = 'true';
    await runOnce();
    expect(mockSweep).toHaveBeenCalledWith({ dryRun: true });
  });

  it('sends for real when dry run is off', async () => {
    await runOnce();
    expect(mockSweep).toHaveBeenCalledWith({ dryRun: false });
  });
});

describe('runOnce', () => {
  it('returns the sweep counts', async () => {
    await expect(runOnce()).resolves.toEqual({ sent: 2, considered: 3 });
  });

  it('swallows a sweep failure rather than rejecting', async () => {
    // A rejection here becomes an unhandled rejection inside a timer, which
    // can take the process down.
    mockSweep.mockRejectedValue(new Error('smtp exploded'));
    await expect(runOnce()).resolves.toEqual({ sent: 0, considered: 0 });
  });

  it('does not overlap with a sweep already in flight', async () => {
    // Two concurrent sweeps race for the same (userId, stage) rows.
    let release!: () => void;
    mockSweep.mockReturnValue(
      new Promise((r) => { release = () => r({ considered: 1, sent: 1, skipped: {}, errors: 0 }); }),
    );

    const first = runOnce();
    const second = await runOnce();          // while the first is still running
    expect(second).toEqual({ sent: 0, considered: 0 });
    expect(mockSweep).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('accepts new runs once the previous one finishes', async () => {
    await runOnce();
    await runOnce();
    expect(mockSweep).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight flag even when the sweep throws', async () => {
    mockSweep.mockRejectedValueOnce(new Error('boom'));
    await runOnce();
    mockSweep.mockResolvedValue({ considered: 1, sent: 1, skipped: {}, errors: 0 });
    await runOnce();
    expect(mockSweep).toHaveBeenCalledTimes(2);
  });
});

describe('scheduling', () => {
  beforeEach(() => {
    process.env.ABANDONED_CART_SCHEDULER = 'on';
  });

  it('does NOT run on startup', async () => {
    // Unlike the inventory scheduler, which catches up immediately. A restart
    // loop here would mail customers once per restart.
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(9_000);
    expect(mockRunWithLock).not.toHaveBeenCalled();
  });

  it('runs on each interval tick', () => {
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);
    expect(mockRunWithLock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(mockRunWithLock).toHaveBeenCalledTimes(3);
  });

  it('is idempotent - starting twice does not double the tick rate', () => {
    vi.useFakeTimers();
    startScheduler(10_000);
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);
    expect(mockRunWithLock).toHaveBeenCalledTimes(1);
  });

  it('stops cleanly', () => {
    vi.useFakeTimers();
    startScheduler(10_000);
    stopScheduler();
    vi.advanceTimersByTime(60_000);
    expect(mockRunWithLock).not.toHaveBeenCalled();
  });

  it('can be restarted after stopping', () => {
    vi.useFakeTimers();
    startScheduler(10_000);
    stopScheduler();
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);
    expect(mockRunWithLock).toHaveBeenCalledTimes(1);
  });

  it('does not keep the process alive', () => {
    // unref matters: a scheduler that pins the event loop stops the API from
    // shutting down cleanly.
    vi.useFakeTimers();
    const spy = vi.spyOn(global, 'setInterval');
    startScheduler(10_000);
    const handle = spy.mock.results[0]?.value;
    expect(typeof handle?.unref).toBe('function');
    spy.mockRestore();
  });
});

describe('distributed locking', () => {
  beforeEach(() => {
    process.env.ABANDONED_CART_SCHEDULER = 'on';
  });

  it('wraps every tick in the lock', () => {
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);

    const [name, lease, fn] = mockRunWithLock.mock.calls[0];
    expect(name).toBe('abandoned-cart');
    expect(typeof fn).toBe('function');
    // The lease must outlast the interval, or a slow sweep gets stolen
    // mid-flight and a second instance mails the same customers.
    expect(lease).toBeGreaterThan(10_000);
  });

  it('uses a different lock than the inventory scheduler', async () => {
    // Sharing a lock name would make the two jobs block each other.
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);
    expect(mockRunWithLock.mock.calls[0][0]).not.toBe('inventory');
  });

  it('skips the sweep when another instance holds the lock', async () => {
    // This is what stops a second API instance sending duplicate emails.
    mockRunWithLock.mockImplementation(async () => undefined);
    vi.useFakeTimers();
    startScheduler(10_000);
    vi.advanceTimersByTime(10_000);
    await Promise.resolve();
    expect(mockSweep).not.toHaveBeenCalled();
  });
});
