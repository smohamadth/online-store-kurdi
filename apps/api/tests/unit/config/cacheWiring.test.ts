/**
 * Pins which caches are actually reachable, and guards the invalidation rule.
 *
 * Findings this file records:
 *
 *  - product.service.ts caches products by id / slug / featured for 1 hour and
 *    invalidates on create/update/delete. But product.service.ts and
 *    product.controller.ts are NOT wired into the app (product.routes.ts is the
 *    live implementation and does no caching at all). So the product cache is
 *    dead code: it neither speeds anything up nor serves stale data today.
 *
 *    That matters because the cached payload includes `quantity`, while stock
 *    is written from inventory.service, order placement, and importExport -
 *    none of which clear the cache. If someone wires the service in as-is,
 *    a sale would not update the product's displayed stock for up to an hour,
 *    and the store would happily oversell. This test fails the moment the
 *    service becomes reachable, so that decision cannot be made silently.
 *
 *  - The invalidation that does exist is a `product:*` prefix sweep, which is
 *    correct in that it cannot leave a stale by-id entry when a slug changes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../../../src');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');

describe('product cache reachability', () => {
  it('product.routes.ts is the live implementation and does not cache', () => {
    const routes = read('modules/products/product.routes.ts');
    expect(routes).not.toMatch(/\bcache\.(get|set|del|keys|incr)\b/);
  });

  it('the legacy ProductService is still unreachable from the app', () => {
    // app.ts must not mount the controller, and nothing outside the products
    // module may import the service. If this fails, read the note above: the
    // cache it enables is invalidated ONLY by its own CRUD methods, so stock
    // written elsewhere would go stale for the full hour TTL.
    const app = read('app.ts');
    expect(app).not.toMatch(/product\.controller/);

    const importers = ['modules/orders/order.routes.ts', 'modules/inventory/inventory.routes.ts']
      .filter((f) => /from ['"].*product\.service['"]/.test(read(f)));
    expect(importers).toEqual([]);
  });

  it('if the product cache is ever used, every product writer must invalidate', () => {
    // Guard rather than aspiration: the moment product.service.ts is wired in,
    // these modules become sources of stale reads unless they clear the cache.
    const service = read('modules/products/product.service.ts');
    const cachesQuantity =
      /cache\.set\(/.test(service) && /quantity: product\.quantity/.test(service);
    if (!cachesQuantity) return; // caching or the field was removed - fine.

    const app = read('app.ts');
    const wiredIn = /product\.controller/.test(app);
    if (!wiredIn) return; // dead code; nothing to enforce yet.

    const writers = [
      'modules/inventory/inventory.service.ts',
      'modules/orders/order.routes.ts',
      'modules/importExport/commit.ts',
    ];
    const withoutInvalidation = writers.filter((f) => !/cache\.(del|keys|clear)/.test(read(f)));
    expect(
      withoutInvalidation,
      'these modules write product stock but never invalidate the product cache',
    ).toEqual([]);
  });
});

describe('cache invalidation style', () => {
  it('clearProductCache sweeps the whole product prefix', () => {
    const service = read('modules/products/product.service.ts');
    expect(service).toMatch(/cache\.keys\(`\$\{this\.cachePrefix\}\*`\)/);
  });

  it('recommendation caches are keyed per user where they are personal', () => {
    // getBasedOnHistory is per-user data; its key must include the userId or
    // one customer's browsing history would be served to another.
    const svc = read('modules/recommendations/recommendation.service.ts');
    expect(svc).toMatch(/history:\$\{userId\}/);
  });

  it('the personalized feed only adds per-user data when a user is known', () => {
    // /personalized is optionalAuth, so it serves anonymous callers too. The
    // shared parts (trending, new arrivals) are cached under user-independent
    // keys; the personal part must be gated on userId being present.
    const svc = read('modules/recommendations/recommendation.service.ts');
    expect(svc).toMatch(/if \(userId\) \{\s*\n\s*recommendations\.basedOnHistory/);
  });
});
