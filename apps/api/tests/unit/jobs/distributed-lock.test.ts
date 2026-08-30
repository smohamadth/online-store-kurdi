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

vi.mock('../../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { tryAcquireLock } from '../../../src/jobs/distributedLock';

describe('distributed-lock', () => {
  beforeEach(() => {
    upsert.mockClear();
    updateMany.mockClear();
    updateMany.mockResolvedValue({ count: 1 });
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
