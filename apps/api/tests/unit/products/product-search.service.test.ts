/**
 * Unit tests for the product search provider selection (Postgres vs
 * Elasticsearch) and the fail-soft behaviour.
 *
 * The Elasticsearch backend is only ever exercised with a live cluster, so
 * here we assert the things that must hold without one:
 *   - the default provider is 'postgres'
 *   - the postgres provider issues the expected Prisma `contains` query
 *   - index maintenance on the postgres provider is a no-op
 *   - getProductSearch()/setProductSearch()/resetProductSearch() wiring
 *   - an elasticsearch provider whose cluster is unreachable stays
 *     `available=false` and its search falls back to the Postgres query
 *     (i.e. the storefront keeps working even when ES is down)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { envMock, prismaMock } = vi.hoisted(() => ({
  envMock: {
    SEARCH_PROVIDER: 'postgres' as 'postgres' | 'elasticsearch',
    ELASTICSEARCH_URL: 'http://localhost:9200',
    ELASTICSEARCH_INDEX: 'products',
    // Logger needs these; without them the File transport throws at import.
    LOG_LEVEL: 'error',
    LOG_FILE: 'logs/test.log',
  },
  prismaMock: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../../src/config/environment', () => ({
  env: envMock,
  isDevelopment: false,
  isProduction: false,
  isTest: true,
}));

vi.mock('../../../src/config/database', () => ({ prisma: prismaMock }));
// The service only logs through the real logger; silence nothing, it is fine.

import {
  getProductSearch,
  setProductSearch,
  resetProductSearch,
  connectSearch,
  disconnectSearch,
} from '../../../src/modules/products/productSearch.service';

beforeEach(() => {
  resetProductSearch();
  prismaMock.product.findMany.mockReset();
  prismaMock.product.findUnique.mockReset();
  envMock.SEARCH_PROVIDER = 'postgres';
});

describe('product search provider selection', () => {
  it('defaults to the postgres provider', () => {
    const s = getProductSearch();
    expect(s.name).toBe('postgres');
    expect(s.available).toBe(true);
  });

  it('resetProductSearch then getProductSearch rebuilds from config', () => {
    const a = getProductSearch();
    setProductSearch(a); // same instance while set
    expect(getProductSearch()).toBe(a);
    resetProductSearch();
    expect(getProductSearch()).not.toBe(a);
  });
});

describe('postgres provider', () => {
  it('issues the expected `contains` query and returns hits', async () => {
    const row = { id: 'p1', name: 'Red Apple', status: 'active' };
    prismaMock.product.findMany.mockResolvedValue([row]);

    const s = getProductSearch();
    const hits = await s.search('Apple', 10);

    expect(prismaMock.product.findMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        OR: [
          { name: { contains: 'Apple' } },
          { description: { contains: 'Apple' } },
          { sku: { contains: 'Apple' } },
        ],
      },
      include: { images: true, category: true, variants: true, reviews: { select: { rating: true } } },
      take: 10,
    });
    expect(hits).toEqual([row]);
  });

  it('index maintenance is a no-op for postgres', async () => {
    const s = getProductSearch();
    await expect(s.indexProduct('x')).resolves.toBeUndefined();
    await expect(s.deleteProduct('x')).resolves.toBeUndefined();
    await expect(s.reindexAll()).resolves.toBe(0);
    await expect(s.disconnect()).resolves.toBeUndefined();
  });
});

describe('elasticsearch provider (cluster down)', () => {
  it('stays unavailable and falls back to the postgres query', async () => {
    envMock.SEARCH_PROVIDER = 'elasticsearch';
    prismaMock.product.findMany.mockResolvedValue([{ id: 'p2', name: 'Fallback', status: 'active' }]);

    const s = getProductSearch();
    expect(s.name).toBe('elasticsearch');
    // No live cluster in unit tests: ping fails, so `available` stays false
    // and search answers from Postgres.
    expect(s.available).toBe(false);

    const hits = await s.search('Something', 5);
    expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
    expect(hits).toEqual([{ id: 'p2', name: 'Fallback', status: 'active' }]);
  });

  it('connectSearch logs but does not throw when ES is down', async () => {
    envMock.SEARCH_PROVIDER = 'elasticsearch';
    // checkConnection pings a non-existent cluster; it must swallow the error.
    await expect(connectSearch()).resolves.toBeUndefined();
  });
});

describe('disconnectSearch', () => {
  it('closes the provider client', async () => {
    await expect(disconnectSearch()).resolves.toBeUndefined();
  });
});
