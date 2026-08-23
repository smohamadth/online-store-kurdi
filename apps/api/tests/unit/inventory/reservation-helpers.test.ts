/**
 * Unit tests for the inventory service's pure helpers.
 *
 * Complements verifyWebhookSignature.test.ts with edge cases for
 * the reservation helpers added in the second pass: releaseReservation
 * and extendReservation. Both have I/O on the prisma client, so we
 * stub it via vi.hoisted mocks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockFindUnique, mockUpdate, mockUpdateMany } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
}));

vi.mock('../../../src/config/database', () => ({
  prisma: {
    stockReservation: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
  },
}));

vi.mock('../../../src/middleware/errorHandler', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import {
  releaseReservation,
  extendReservation,
  consumeReservationsForCartItemIds,
} from '../../../src/modules/inventory/inventory.service';

describe('releaseReservation', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it('releases a fresh (un-released) reservation', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'r1', releasedAt: null });
    mockUpdate.mockResolvedValueOnce({ id: 'r1', releasedAt: new Date() });
    const r = await releaseReservation('r1');
    expect(r.releasedAt).toBeTruthy();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { releasedAt: expect.any(Date) },
    });
  });

  it('is a no-op for an already-released reservation', async () => {
    const already = { id: 'r1', releasedAt: new Date() };
    mockFindUnique.mockResolvedValueOnce(already);
    const r = await releaseReservation('r1');
    expect(r).toBe(already);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the id is unknown', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await expect(releaseReservation('nope')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('extendReservation', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it('extends by a positive number of minutes from now', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'r1', releasedAt: null });
    mockUpdate.mockImplementation(async (args: any) => ({ id: 'r1', reservedUntil: args.data.reservedUntil }));
    const r = await extendReservation('r1', 30);
    const newDeadline = new Date(r.reservedUntil).getTime();
    // New deadline should be ~30 min in the future. Allow a 5 min
    // window for clock drift between the call and the assertion.
    expect(newDeadline).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect(newDeadline).toBeLessThan(Date.now() + 35 * 60_000);
  });

  it('refuses to extend a released reservation', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'r1', releasedAt: new Date() });
    await expect(extendReservation('r1', 30)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the id is unknown', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await expect(extendReservation('nope', 30)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects ttlMinutes that is not a positive number', async () => {
    await expect(extendReservation('r1', 0)).rejects.toMatchObject({ statusCode: 400 });
    await expect(extendReservation('r1', -10)).rejects.toMatchObject({ statusCode: 400 });
    await expect(extendReservation('r1', NaN)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('consumeReservationsForCartItemIds', () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
  });

  it('short-circuits to 0 for an empty array (no DB call)', async () => {
    const n = await consumeReservationsForCartItemIds([]);
    expect(n).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('stamps releasedAt on every active reservation for the given cart items', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 3 });
    const n = await consumeReservationsForCartItemIds(['c1', 'c2', 'c3']);
    expect(n).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        cartItemId: { in: ['c1', 'c2', 'c3'] },
        releasedAt: null,
      },
      data: { releasedAt: expect.any(Date) },
    });
  });
});
