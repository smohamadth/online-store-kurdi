/**
 * Unit tests for the inventory scheduler.
 *
 * We can't wait 5 minutes in a unit test, so the test exercises
 * `runOnce()` directly and verifies that the integration point
 * (runAutoReorder + releaseExpiredReservations) is wired up.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.mock is hoisted to the top of the file by vitest's transformer,
// so the factory is evaluated before any `import` below. Inside the
// factory we define the mocks and expose them via the returned object.
const { mockRunAutoReorder, mockReleaseExpired } = vi.hoisted(() => ({
  mockRunAutoReorder: vi.fn(async () => ({ scanned: 1, draftsCreated: 0, errors: [] })),
  mockReleaseExpired: vi.fn(async () => 2),
}));

vi.mock('../../../src/modules/inventory/inventory.service', () => ({
  runAutoReorder: mockRunAutoReorder,
  releaseExpiredReservations: mockReleaseExpired,
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runOnce, startScheduler, stopScheduler } from '../../../src/jobs/inventory-scheduler';

describe('inventory-scheduler', () => {
  beforeEach(() => {
    mockRunAutoReorder.mockClear();
    mockReleaseExpired.mockClear();
  });

  afterEach(() => {
    stopScheduler();
  });

  it('runOnce() calls both jobs once and returns their counts', async () => {
    const r = await runOnce();
    expect(r.releasedReservations).toBe(2);
    expect(r.draftsCreated).toBe(0);
    expect(mockReleaseExpired).toHaveBeenCalledTimes(1);
    expect(mockRunAutoReorder).toHaveBeenCalledTimes(1);
    expect(mockRunAutoReorder).toHaveBeenCalledWith({ dryRun: false });
  });

  it('runOnce() survives a thrown error and returns zero counts', async () => {
    mockRunAutoReorder.mockRejectedValueOnce(new Error('boom'));
    const r = await runOnce();
    expect(r.releasedReservations).toBe(0);
    expect(r.draftsCreated).toBe(0);
  });

  it('startScheduler() respects INVENTORY_SCHEDULER=off', () => {
    const prev = process.env.INVENTORY_SCHEDULER;
    process.env.INVENTORY_SCHEDULER = 'off';
    startScheduler(60_000);
    // No call expected because the env var disables it. The mock
    // counts should be 0.
    expect(mockRunAutoReorder).not.toHaveBeenCalled();
    if (prev === undefined) delete process.env.INVENTORY_SCHEDULER;
    else process.env.INVENTORY_SCHEDULER = prev;
  });
});
