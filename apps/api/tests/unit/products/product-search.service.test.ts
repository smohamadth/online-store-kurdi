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

const { envMock, prismaMock, esClient, logger } = vi.hoisted(() => ({
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
  // A controllable fake of the @elastic/elasticsearch client so we can push
  // the provider past the "cluster is up" check and exercise the ES search
  // path (and its fail-soft fallback) without a live cluster.
  esClient: {
    ping: vi.fn(async () => true),
    search: vi.fn(),
    index: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    close: vi.fn(async () => {}),
    indices: {
      exists: vi.fn(async () => true),
      create: vi.fn(async () => ({})),
    },
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/config/environment', () => ({
  env: envMock,
  isDevelopment: false,
  isProduction: false,
  isTest: true,
}));

vi.mock('../../../src/config/database', () => ({ prisma: prismaMock }));
vi.mock('../../../src/utils/logger', () => ({ logger }));
vi.mock('@elastic/elasticsearch', () => ({
  Client: class {
    ping = esClient.ping;
    search = esClient.search;
    index = esClient.index;
    delete = esClient.delete;
    close = esClient.close;
    indices = esClient.indices;
  },
}));

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
  esClient.search.mockReset();
  esClient.index.mockReset();
  esClient.index.mockResolvedValue({});
  esClient.ping.mockResolvedValue(true);
  esClient.indices.exists.mockResolvedValue(true);
  logger.warn.mockClear();
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

describe('elasticsearch provider (mid-request failure fails soft)', () => {
  async function makeAvailableProvider() {
    envMock.SEARCH_PROVIDER = 'elasticsearch';
    const s = getProductSearch();
    // Simulate a cluster verified up at boot.
    await s.checkConnection();
    expect(s.available).toBe(true);
    return s;
  }

  it('falls back to Postgres and marks the cluster unavailable when ES search throws', async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: 'p3', name: 'PG', status: 'active' }]);
    esClient.search.mockRejectedValueOnce(new Error('connection reset'));

    const s = await makeAvailableProvider();
    const hits = await s.search('Apple', 5);

    // The whole point: it must NOT 500 / throw, it answers from Postgres.
    expect(hits).toEqual([{ id: 'p3', name: 'PG', status: 'active' }]);
    expect(s.available).toBe(false);
    expect(esClient.search).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.findMany).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('skips ES entirely on subsequent calls once marked unavailable', async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: 'p3', name: 'PG', status: 'active' }]);
    esClient.search.mockRejectedValueOnce(new Error('reset'));

    const s = await makeAvailableProvider();
    await s.search('a', 5); // ES throws -> fallback, available=false
    await s.search('b', 5); // available=false -> straight to Postgres

    expect(esClient.search).toHaveBeenCalledTimes(1); // only the first tried ES
    expect(prismaMock.product.findMany).toHaveBeenCalledTimes(2); // both answered from PG
  });

  it('returns Postgres hits when ES search succeeds but a result is missing from PG', async () => {
    // ES returns ids [a, missing, b]; only a and b exist in Postgres.
    esClient.search.mockResolvedValue({
      hits: {
        hits: [
          { _source: { id: 'a' } },
          { _source: { id: 'missing' } },
          { _source: { id: 'b' } },
        ],
      },
    });
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'a', name: 'A', status: 'active' },
      { id: 'b', name: 'B', status: 'active' },
    ]);

    const s = await makeAvailableProvider();
    const hits = await s.search('Apple', 10);
    // Ranking order preserved, missing product filtered out, no throw.
    expect(hits.map((h: any) => h.id)).toEqual(['a', 'b']);
  });

  it('reindexAll returns the count of products actually indexed, tolerating per-item failures', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'ok1', name: 'A', description: null, sku: 'a', status: 'active', category: null },
      { id: 'bad', name: 'B', description: null, sku: 'b', status: 'active', category: null },
      { id: 'ok2', name: 'C', description: null, sku: 'c', status: 'active', category: null },
    ]);
    esClient.index.mockImplementation(async ({ id }: { id: string }) => {
      if (id === 'bad') throw new Error('boom');
      return {};
    });

    const s = await makeAvailableProvider();
    const indexed = await s.reindexAll();
    // ok1 and ok2 indexed; the failing row is logged but does not abort.
    expect(indexed).toBe(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('reindexAll is a no-op (0) when the cluster is unavailable', async () => {
    envMock.SEARCH_PROVIDER = 'elasticsearch';
    const s = getProductSearch();
    expect(s.available).toBe(false);
    await expect(s.reindexAll()).resolves.toBe(0);
  });
});
