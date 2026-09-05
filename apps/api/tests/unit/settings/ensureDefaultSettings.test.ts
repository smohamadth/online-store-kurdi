import { describe, it, expect, vi } from 'vitest';
import { ensureDefaultSettings } from '../../../src/modules/settings/ensureDefaultSettings';

function fakePrisma(opts: {
  existing?: any;
  upsert?: () => Promise<any>;
  afterConflict?: any;
}) {
  return {
    storeSettings: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(opts.existing ?? null)
        .mockResolvedValue(opts.afterConflict ?? opts.existing ?? { id: 'default' }),
      upsert: opts.upsert
        ? vi.fn(opts.upsert)
        : vi.fn().mockResolvedValue({ id: 'default', storeName: 'My Store' }),
    },
  };
}

describe('ensureDefaultSettings', () => {
  it('returns the existing row without writing', async () => {
    const row = { id: 'default', storeName: 'Live' };
    const prisma = fakePrisma({ existing: row });
    await expect(ensureDefaultSettings(prisma)).resolves.toEqual(row);
    expect(prisma.storeSettings.upsert).not.toHaveBeenCalled();
  });

  it('upserts when the row is missing', async () => {
    const created = { id: 'default', storeName: 'My Store' };
    const prisma = fakePrisma({
      existing: null,
      upsert: async () => created,
    });
    await expect(ensureDefaultSettings(prisma)).resolves.toEqual(created);
    expect(prisma.storeSettings.upsert).toHaveBeenCalledTimes(1);
  });

  it('re-reads after a unique-constraint race (P2002)', async () => {
    const winner = { id: 'default', storeName: 'Won' };
    const prisma = fakePrisma({
      existing: null,
      afterConflict: winner,
      upsert: async () => {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      },
    });
    await expect(ensureDefaultSettings(prisma)).resolves.toEqual(winner);
  });

  it('rethrows non-conflict errors', async () => {
    const prisma = fakePrisma({
      existing: null,
      upsert: async () => {
        throw new Error('adapter down');
      },
    });
    await expect(ensureDefaultSettings(prisma)).rejects.toThrow('adapter down');
  });
});
