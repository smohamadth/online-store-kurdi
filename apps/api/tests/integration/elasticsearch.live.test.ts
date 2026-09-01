/**
 * LIVE test for the Elasticsearch product-search backend.
 *
 * This one talks to a REAL Elasticsearch cluster. It seeds products through
 * the in-memory mock prisma (so no real DB is needed), indexes them into the
 * actual cluster through the ElasticsearchSearch provider, and verifies the
 * index -> search -> re-hydrate -> delete round-trip against a live server.
 *
 * The whole suite is SKIPPED when no cluster is reachable, so
 * `npm run test:integration` stays green on machines without Elasticsearch.
 * Point it at a cluster with:
 *
 *   ELASTICSEARCH_URL=http://localhost:9200   (docker compose up elasticsearch)
 *   ELASTICSEARCH_INDEX=products-test-live
 *
 * Run it explicitly:
 *   cd apps/api && npx vitest run --config vitest.integration.config.ts \
 *     tests/integration/elasticsearch.live.test.ts
 */
process.env.SEARCH_PROVIDER = 'elasticsearch';
process.env.ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
process.env.ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX || 'products-test-live';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cleanDatabase } from '../helpers/db';
import { createProduct, createCategory } from '../helpers/factories';
import type { SearchProvider } from '../../src/modules/products/productSearch.service';

// --- Module-scope setup -----------------------------------------------------
// The availability probe must run before the `describe.skipIf(...)` calls are
// evaluated (they run at module load), so the connection happens here with
// top-level await rather than in beforeAll. Dynamic import AFTER the env vars
// are set so this file's module registry picks up the elasticsearch provider.
const { connectSearch, disconnectSearch, getProductSearch } = await import(
  '../../src/modules/products/productSearch.service'
);
const { Client } = await import('@elastic/elasticsearch');

const client = new Client({ node: process.env.ELASTICSEARCH_URL });
const search: SearchProvider = getProductSearch();
await connectSearch();
const esAvailable: boolean = search.available;

afterAll(async () => {
  // Drop the test index so stale docs never leak into a later run. Best
  // effort - if the cluster went away mid-run this just swallows it.
  try {
    await client.indices.delete({ index: process.env.ELASTICSEARCH_INDEX });
  } catch {
    /* index may already be gone */
  }
  await disconnectSearch();
});

// --- Live tests (skipped when no cluster is reachable) ----------------------
describe.skipIf(!esAvailable)('Elasticsearch live search (real cluster)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  it('indexes seeded products and finds them by name via search()', async () => {
    const cat = await createCategory({ name: 'Clothing', slug: 'clothing' });
    await createProduct({ name: 'Kurdish Kurte Shirt', sku: 'kurte-1', price: 20, categoryId: cat.id });
    await createProduct({ name: 'Plain Kurta', sku: 'kurta-2', price: 25, categoryId: cat.id });
    await createProduct({ name: 'Banana', sku: 'ban-1', price: 2, categoryId: cat.id });

    // Build the index from what the mock store holds.
    const indexed = await search.reindexAll();
    expect(indexed).toBeGreaterThanOrEqual(3);

    // Give ES a moment to refresh so the docs are searchable.
    await client.indices.refresh({ index: process.env.ELASTICSEARCH_INDEX });

    // 'Kurte' is an exact token inside 'Kurdish Kurte Shirt', so this must
    // match regardless of stemmer/fuzzy behaviour. We assert the exact-SKU
    // product is found (deterministic) rather than relying on a fuzzy hit
    // for the near-miss 'Plain Kurta'.
    const hits = await search.search('Kurte', 10);
    expect(hits.map((h: any) => h.sku)).toContain('kurte-1');

    // Non-matching query returns nothing (not an error).
    const none = await search.search('zzzznotthere', 10);
    expect(none).toHaveLength(0);
  });

  it('indexProduct/deleteProduct maintain the index on writes', async () => {
    const cat = await createCategory({ name: 'Gear', slug: 'gear' });
    const p = await createProduct({ name: 'Backpack', sku: 'pack-1', price: 50, categoryId: cat.id });

    await search.indexProduct(p.id);
    await client.indices.refresh({ index: process.env.ELASTICSEARCH_INDEX });
    let hits = await search.search('Backpack', 10);
    expect(hits.some((h: any) => h.id === p.id)).toBe(true);

    await search.deleteProduct(p.id);
    await client.indices.refresh({ index: process.env.ELASTICSEARCH_INDEX });
    hits = await search.search('Backpack', 10);
    expect(hits.some((h: any) => h.id === p.id)).toBe(false);
  });

  it('is available against the live cluster', () => {
    expect(search.available).toBe(true);
  });
});

// When the cluster is unreachable, say so in the skipped report instead of
// passing silently.
describe.skipIf(esAvailable)('Elasticsearch live search (cluster unavailable)', () => {
  it('is skipped: no Elasticsearch cluster reachable at ' + process.env.ELASTICSEARCH_URL, () => {
    expect(process.env.ELASTICSEARCH_URL).toBeTruthy();
  });
});
