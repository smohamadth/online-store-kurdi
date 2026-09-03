// ---------------------------------------------------------------------------
// Product search provider abstraction (Postgres vs Elasticsearch).
//
// Two interchangeable backends behind one interface:
//
//   - 'postgres'       (default)  the original Prisma `contains` query. No
//                                 extra infrastructure, always works, fine
//                                 for small-to-mid catalogs.
//   - 'elasticsearch'             the optional advanced search. Indexed and
//                                 searched via @elastic/elasticsearch with a
//                                 Sorani-aware analyzer (helps Arabic-script
//                                 Kurdish) plus fuzzy matching + relevance
//                                 scoring. The index is kept in step on
//                                 product writes.
//
// The active backend is picked from `env.SEARCH_PROVIDER`. Elasticsearch is
// ALWAYS fail-soft: if it is configured but unreachable, the affected request
// (or index write) logs a warning and the caller falls back to the Postgres
// search - it never turns a product write or a search into a hard error.
//
// Both backends return full product records (with images / category /
// variants / reviews) so the route serialises them identically.
// ---------------------------------------------------------------------------
import { Client } from '@elastic/elasticsearch';
import { containsInsensitive } from '../../utils/caseInsensitive';
import { env } from '../../config/environment';
import { logger } from '../../utils/logger';
import { prisma } from '../../config/database';

export type SearchProviderName = 'postgres' | 'elasticsearch';

export interface SearchProvider {
  readonly name: SearchProviderName;
  /** Whether the backend is actually usable right now (ES may be down). */
  readonly available: boolean;
  /** Full product records matching `query`, ranked best-first. */
  search(query: string, limit: number): Promise<any[]>;
  /** Index a product (create or refresh). No-op for postgres. */
  indexProduct(productId: string): Promise<void>;
  /** Remove a product from the index. No-op for postgres. */
  deleteProduct(productId: string): Promise<void>;
  /** (Re)build the whole index from the catalogue. Returns rows indexed. */
  reindexAll(): Promise<number>;
  /** Close any held client. No-op for postgres. */
  disconnect(): Promise<void>;
}

// The relation set every search result must carry, matching what the
// product routes' `formatProduct` expects.
const SEARCH_INCLUDE = {
  images: true,
  category: true,
  variants: true,
  reviews: { select: { rating: true } },
} as const;

/** The original, dependency-free search: Prisma substring match on active rows. */
async function postgresSearch(query: string, limit: number): Promise<any[]> {
  // containsInsensitive adds `mode: 'insensitive'` on PostgreSQL and omits it
  // on SQLite. Hardcoding either is wrong: SQLite REJECTS the flag, while
  // without it PostgreSQL's LIKE is case-sensitive - so a shopper searching
  // "laptop" would stop finding "Laptop Pro" the moment the store moved to
  // PostgreSQL, silently and with no error.
  const match = containsInsensitive(query);
  return prisma.product.findMany({
    where: {
      status: 'active',
      OR: [
        { name: match },
        { description: match },
        { sku: match },
      ],
    },
    include: SEARCH_INCLUDE,
    take: limit,
  });
}

class PostgresSearch implements SearchProvider {
  readonly name: SearchProviderName = 'postgres';
  readonly available = true;

  async search(query: string, limit: number): Promise<any[]> {
    return postgresSearch(query, limit);
  }

  async indexProduct(): Promise<void> {}
  async deleteProduct(): Promise<void> {}
  async reindexAll(): Promise<number> {
    return 0;
  }
  async disconnect(): Promise<void> {}
}

// The Elasticsearch backend. The client is created lazily on first use so a
// postgres-only deployment never even opens a socket.
class ElasticsearchSearch implements SearchProvider {
  readonly name: SearchProviderName = 'elasticsearch';
  available = false;

  private client?: Client;
  private index: string;

  constructor() {
    this.index = env.ELASTICSEARCH_INDEX;
  }

  private getClient(): Client {
    if (!this.client) {
      this.client = new Client({ node: env.ELASTICSEARCH_URL });
    }
    return this.client;
  }

  private async ensureIndex(): Promise<void> {
    const client = this.getClient();
    const exists = await client.indices.exists({ index: this.index });
    if (!exists) {
      await client.indices.create({
        index: this.index,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              status: { type: 'keyword' },
              // `sorani` = Lucene's Sorani-Kurdish analyzer (normalizer +
              // light stemmer + stopwords, Arabic-script aware). It still
              // lowercases + tokenizes Latin-script text (English, Kurmanji
              // Latin orthography) so it is a reasonable default for a
              // Kurdish-first catalogue that also carries English.
              name: { type: 'text', analyzer: 'sorani' },
              description: { type: 'text', analyzer: 'sorani' },
              sku: { type: 'text', analyzer: 'sorani' },
              categoryName: { type: 'text', analyzer: 'sorani' },
            },
          },
        },
      });
    }
  }

  /**
   * Verify the cluster is reachable and the index exists. Fail-soft: on any
   * error `available` stays false and the caller uses the Postgres backend.
   */
  async checkConnection(): Promise<void> {
    try {
      await this.getClient().ping();
      await this.ensureIndex();
      this.available = true;
    } catch (err) {
      this.available = false;
      logger.warn(
        `⚠️ Elasticsearch unreachable (${env.ELASTICSEARCH_URL}) - falling back to Postgres search: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async search(query: string, limit: number): Promise<any[]> {
    // Fail-soft: if the cluster has not been verified reachable (or went
    // down), answer from Postgres so the storefront keeps working.
    if (!this.available) return postgresSearch(query, limit);

    try {
      const client = this.getClient();
      const body = {
        query: {
          bool: {
            filter: [{ term: { status: 'active' } }],
            must: [
              {
                multi_match: {
                  query,
                  fields: ['name^4', 'sku^3', 'categoryName^2', 'description'],
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
        _source: ['id'],
        size: limit,
      };
      const res = await client.search({ index: this.index, body });
      const ids: string[] = (res.hits.hits as any[])
        .map((h) => (h._source as any)?.id)
        .filter((x): x is string => typeof x === 'string');

      if (ids.length === 0) return [];

      // Re-hydrate the full rows from Postgres (the index stores only the id,
      // so results always have fresh data). Preserve the ES ranking order.
      const rows: any[] = await prisma.product.findMany({
        where: { id: { in: ids } },
        include: SEARCH_INCLUDE,
      });
      const byId = new Map(rows.map((r): [string, any] => [r.id, r]));
      return ids.map((id) => byId.get(id)).filter(Boolean);
    } catch (err) {
      // A cluster verified up at boot can still fail/timeout on a request. The
      // whole point of this provider is "never hard-fail the storefront", so a
      // mid-request ES outage must NOT surface as a 500: mark the cluster
      // unavailable (so subsequent calls skip ES and go straight to Postgres
      // instead of timing out every time) and answer from Postgres.
      this.available = false;
      logger.warn(
        `⚠️ Elasticsearch search failed; falling back to Postgres (${err instanceof Error ? err.message : err})`,
      );
      return postgresSearch(query, limit);
    }
  }

  async indexProduct(productId: string): Promise<void> {
    if (!this.available) return;
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { category: { select: { name: true } } },
      });
      if (!product) return;
      await this.getClient().index({
        index: this.index,
        id: product.id,
        body: {
          id: product.id,
          name: product.name,
          description: product.description ?? '',
          sku: product.sku,
          categoryName: product.category?.name ?? '',
          status: product.status,
        },
      });
    } catch (err) {
      logger.warn(`⚠️ Elasticsearch index failed for product ${productId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  async deleteProduct(productId: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.getClient().delete({ index: this.index, id: productId });
    } catch (err: any) {
      // 404 = already gone, which is fine; anything else is worth logging.
      if (err?.statusCode !== 404) {
        logger.warn(`⚠️ Elasticsearch delete failed for product ${productId}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  async reindexAll(): Promise<number> {
    if (!this.available) return 0;
    const products = await prisma.product.findMany({
      select: { id: true, name: true, description: true, sku: true, status: true, category: { select: { name: true } } },
    });
    // Index each product independently so a single transient failure does not
    // abort the whole reindex (which would leave a partial index and make the
    // admin route 500). Return the number of rows actually indexed.
    let indexed = 0;
    let failures = 0;
    for (const p of products) {
      try {
        await this.getClient().index({
          index: this.index,
          id: p.id,
          body: {
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            sku: p.sku,
            categoryName: p.category?.name ?? '',
            status: p.status,
          },
        });
        indexed += 1;
      } catch (err) {
        failures += 1;
        logger.warn(
          `⚠️ Elasticsearch reindex failed for product ${p.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if (failures > 0) {
      logger.warn(`🔎 Elasticsearch reindex completed with ${failures} failure(s) out of ${products.length}`);
    } else {
      logger.info(`🔎 Elasticsearch reindexed ${indexed} products`);
    }
    return indexed;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* best-effort on shutdown */
      }
      this.client = undefined;
    }
  }
}

let singleton: SearchProvider | null = null;

/**
 * The active search backend. `elasticsearch` is only chosen when configured
 * AND verified reachable; otherwise the Postgres backend is returned so the
 * rest of the app never has to branch on availability.
 */
export function getProductSearch(): SearchProvider {
  if (singleton) return singleton;
  singleton =
    env.SEARCH_PROVIDER === 'elasticsearch'
      ? new ElasticsearchSearch()
      : new PostgresSearch();
  return singleton;
}

/** Force the singleton to the given provider (test hook + postgres default). */
export function setProductSearch(provider: SearchProvider): void {
  singleton = provider;
}

/** Reset the singleton (test hook). */
export function resetProductSearch(): void {
  singleton = null;
}

// For the server boot: connect/disconnect hooks mirroring connectRedis.
export async function connectSearch(): Promise<void> {
  if (env.SEARCH_PROVIDER !== 'elasticsearch') {
    logger.info('🔎 Search provider: postgres (contains)');
    return;
  }
  const provider = getProductSearch();
  if (provider.name === 'elasticsearch') {
    // Wait for the availability check so the boot log is accurate.
    await (provider as ElasticsearchSearch).checkConnection();
    if (provider.available) {
      logger.info(`🔎 Search provider: elasticsearch (${env.ELASTICSEARCH_URL})`);
    }
  }
}

export async function disconnectSearch(): Promise<void> {
  if (singleton) {
    await singleton.disconnect();
    singleton = null;
  }
}
