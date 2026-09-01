/**
 * Unit tests for the currency scheduler.
 *
 * Exercises `runOnce()` directly (we can't wait 24h in a unit test) and
 * verifies it is wired to refreshRates. The scheduler guards ticks with the
 * DB distributed lock, so config/database is mocked for isolation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockRefreshRates } = vi.hoisted(() => ({
  mockRefreshRates: vi.fn(async () => ({ base: 'USD', fetched: 2, skipped: 0, errors: [] })),
}));

vi.mock('../../../src/modules/currency/currency.routes', () => ({
  refreshRates: mockRefreshRates,
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockLockUpsert, mockLockUpdateMany } = vi.hoisted(() => ({
  mockLockUpsert: vi.fn(async () => ({})),
  mockLockUpdateMany: vi.fn(async () => ({ count: 1 })),
}));

vi.mock('../../../src/config/database', () => ({
  prisma: {
    scheduledJobLock: { upsert: mockLockUpsert, updateMany: mockLockUpdateMany },
  },
}));

import { runOnce, startScheduler, stopScheduler } from '../../../src/jobs/currency.scheduler';

describe('currency-scheduler', () => {
  beforeEach(() => {
    mockRefreshRates.mockClear();
  });

  afterEach(() => {
    stopScheduler();
  });

  it('runOnce() calls refreshRates once', async () => {
    await runOnce();
    expect(mockRefreshRates).toHaveBeenCalledTimes(1);
  });

  it('runOnce() survives a thrown error', async () => {
    mockRefreshRates.mockRejectedValueOnce(new Error('boom'));
    await expect(runOnce()).resolves.toBeUndefined();
    expect(mockRefreshRates).toHaveBeenCalledTimes(1);
  });

  it('startScheduler() respects CURRENCY_SCHEDULER=off', () => {
    const prev = process.env.CURRENCY_SCHEDULER;
    process.env.CURRENCY_SCHEDULER = 'off';
    startScheduler(60_000);
    expect(mockRefreshRates).not.toHaveBeenCalled();
    if (prev === undefined) delete process.env.CURRENCY_SCHEDULER;
    else process.env.CURRENCY_SCHEDULER = prev;
  });
});
