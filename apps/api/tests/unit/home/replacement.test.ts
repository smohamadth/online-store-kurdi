import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HomeSectionSeed } from '@/modules/home/home.defaults';

const { db, tx } = vi.hoisted(() => {
  const tx = { homeSection: { deleteMany: vi.fn(), create: vi.fn(), findMany: vi.fn() } };
  const db = {
    homeSection: { deleteMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { db, tx };
});
vi.mock('@/config/database', () => ({ prisma: db }));
import { replaceHomeSections } from '@/modules/home/home.applyTheme';

const seeds = (): HomeSectionSeed[] => [
  { key: 'first', type: 'richText', title: 'First', sortOrder: 99, isVisible: true, config: { html: '<p>Safe<script>bad()</script></p>' } },
  { key: 'second', type: 'cta', title: 'Second', sortOrder: 1, isVisible: false, config: { text: 'Copy' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  tx.homeSection.deleteMany.mockResolvedValue({ count: 1 });
  tx.homeSection.create.mockResolvedValue({});
  tx.homeSection.findMany.mockResolvedValue([{ id: 'persisted' }]);
});

describe('transactional homepage replacement', () => {
  it('performs deletion, every insert, and the final read on the same transaction-scoped client', async () => {
    const result = await replaceHomeSections(seeds());
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.homeSection.deleteMany).toHaveBeenCalledWith({});
    expect(tx.homeSection.create).toHaveBeenCalledTimes(2);
    expect(tx.homeSection.create.mock.calls.map(([input]) => input.data.sortOrder)).toEqual([10, 20]);
    expect(tx.homeSection.create.mock.calls[0][0].data.config).not.toContain('<script>');
    expect(tx.homeSection.create.mock.calls[1][0].data.isVisible).toBe(false);
    expect(tx.homeSection.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
    expect(result).toEqual([{ id: 'persisted' }]);
    for (const method of Object.values(db.homeSection)) expect(method).not.toHaveBeenCalled();
    expect(tx.homeSection.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.homeSection.create.mock.invocationCallOrder[0]);
    expect(tx.homeSection.create.mock.invocationCallOrder[1]).toBeLessThan(tx.homeSection.findMany.mock.invocationCallOrder[0]);
  });

  it('lets an intermediate insert failure escape so Prisma can roll the transaction back', async () => {
    tx.homeSection.create.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Insert failed'));
    await expect(replaceHomeSections(seeds())).rejects.toThrow('Insert failed');
    expect(tx.homeSection.create).toHaveBeenCalledTimes(2);
    expect(tx.homeSection.findMany).not.toHaveBeenCalled();
    for (const method of Object.values(db.homeSection)) expect(method).not.toHaveBeenCalled();
    // This verifies transaction wiring/error propagation, not SQL rollback: the
    // in-memory integration mock does not model concurrent database isolation.
  });

  it.each(['too-many', 'long-title', 'long-subtitle', 'large-config'])('validates before opening a destructive transaction (%s)', async (kind) => {
    let input = seeds();
    if (kind === 'too-many') input = Array.from({ length: 101 }, () => seeds()[0]);
    if (kind === 'long-title') input[1].title = 'x'.repeat(201);
    if (kind === 'long-subtitle') input[1].subtitle = 'x'.repeat(501);
    if (kind === 'large-config') input[1].config = { customOne: 'x'.repeat(33000), customTwo: 'y'.repeat(33000) };
    await expect(replaceHomeSections(input)).rejects.toMatchObject({ code: 'INVALID_HOME_TEMPLATE' });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.homeSection.deleteMany).not.toHaveBeenCalled();
  });
});
