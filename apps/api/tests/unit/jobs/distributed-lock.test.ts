/**
 * Unit tests for the DB-backed distributed lock (jobs/distributedLock.ts).
 *
 * The lock must let exactly one caller own a lease at a time: a free/expired
 * row can be claimed, a held row cannot, and release only frees the lease if
 * the caller still owns it (so it can never clobber a renewed owner).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { upsert, updateMany } = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({})),
  updateMany: vi.fn(async () => ({ count: 1 })),
}));

vi.mock('../../../src/config/database', () => ({
  prisma: {
    scheduledJobLock: { upsert, updateMany },
  },
}));

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/logger', () => ({ logger }));

import { tryAcquireLock, runWithLock } from '../../../src/jobs/distributedLock';

describe('distributed-lock', () => {
  beforeEach(() => {
    upsert.mockClear();
    updateMany.mockClear();
    updateMany.mockResolvedValue({ count: 1 });
    logger.error.mockClear();
  });

  it('acquires the lease when the row is free', async () => {
    const lock = await tryAcquireLock('inventory', 300_000);
    expect(lock).not.toBeNull();
    expect(lock!.token).toBeTruthy();
    // Should have ensured the row, then claimed it.
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    // The claim guard must allow expired/empty leases (past heldUntil).
    const where = updateMany.mock.calls[0][0].where;
    expect(where.name).toBe('inventory');
    expect(where.heldUntil).toBeDefined();
  });

  it('returns null when another process holds the lease', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    const lock = await tryAcquireLock('currency', 300_000);
    expect(lock).toBeNull();
  });

  it('steals the lease once the previous holder expires (crash recovery)', async () => {
    // First a holder exists, then it crashes and the lease expires.
    updateMany.mockResolvedValueOnce({ count: 0 }); // held
    updateMany.mockResolvedValueOnce({ count: 1 }); // now expired -> claim
    expect(await tryAcquireLock('inventory', 300_000)).toBeNull();
    const lock = await tryAcquireLock('inventory', 300_000);
    expect(lock).not.toBeNull();
  });

  it('release() frees the lease only when the token still matches', async () => {
    const lock = await tryAcquireLock('inventory', 300_000);
    const token = lock!.token;
    await lock!.release();

    const where = updateMany.mock.calls[1][0].where;
    expect(where.token).toBe(token);
    // release writes a past heldUntil (epoch) = free.
    const data = updateMany.mock.calls[1][0].data;
    expect(data.heldUntil.getTime()).toBe(0);
  });
});

describe('runWithLock', () => {
  beforeEach(() => {
    upsert.mockClear();
    updateMany.mockClear();
    updateMany.mockResolvedValue({ count: 1 });
    logger.error.mockClear();
  });

  it('runs the job and releases the lease when it wins the lock', async () => {
    const fn = vi.fn(async () => 42);
    const ran = await runWithLock('inventory', 300_000, fn);
    expect(ran).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    // The release write must free the lease (epoch heldUntil) with the token.
    const releaseCall = updateMany.mock.calls[1];
    expect(releaseCall[0].data.heldUntil.getTime()).toBe(0);
    expect(releaseCall[0].where.token).toBeTruthy();
  });

  it('skips (returns false) when another process holds the lease', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 }); // held -> cannot claim
    const fn = vi.fn(async () => 42);
    const ran = await runWithLock('inventory', 300_000, fn);
    expect(ran).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not throw when the acquire query fails (DB outage) - the critical no-crash guard', async () => {
    // Simulate the DB being down: the lock query rejects.
    updateMany.mockRejectedValueOnce(new Error('db connection lost'));
    const fn = vi.fn(async () => 42);
    await expect(runWithLock('inventory', 300_000, fn)).resolves.toBe(false);
    // The job must not run and nothing may be released.
    expect(fn).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not throw when the job fails; it logs and still releases', async () => {
    const fn = vi.fn(async () => {
      throw new Error('job boom');
    });
    const ran = await runWithLock('inventory', 300_000, fn);
    expect(ran).toBe(false);
    expect(logger.error).toHaveBeenCalled();
    // Even on failure the lease must be released.
    const releaseCall = updateMany.mock.calls[1];
    expect(releaseCall[0].data.heldUntil.getTime()).toBe(0);
  });

  it('does not throw when release fails', async () => {
    // acquire ok, but the release updateMany throws.
    updateMany.mockResolvedValueOnce({ count: 1 });
    updateMany.mockRejectedValueOnce(new Error('release boom'));
    const fn = vi.fn(async () => 42);
    await expect(runWithLock('inventory', 300_000, fn)).resolves.toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
