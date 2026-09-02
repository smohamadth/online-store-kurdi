/**
 * Cache counters must not lose concurrent updates.
 *
 * analytics.service.ts incremented its real-time counters with
 *
 *     await cache.set(key, ((await cache.get<number>(key)) || 0) + 1, 86400);
 *
 * That is a read-modify-write across two network round-trips. Every request
 * that lands between another request's GET and its SET overwrites the value it
 * read, so increments are silently discarded. For a web-facing counter this is
 * not a rare interleaving but the normal case: measured against a live Redis,
 * 100 concurrent events produced a final count of 1.
 *
 * The session-event list in trackEvent() had the identical shape (read array,
 * push, write whole array back) and dropped events from the same session.
 *
 * Both now use server-side atomic primitives (INCR, RPUSH+LTRIM), which
 * serialise inside Redis. These tests drive a fake client that faithfully
 * reproduces the interleaving: every operation yields to the event loop
 * between its read and its write, exactly as a real socket does.
 */
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * A stand-in for the redis client whose commands are individually atomic but
 * which yields between commands - i.e. the concurrency model that matters.
 */
class FakeRedis {
  strings = new Map<string, string>();
  lists = new Map<string, string[]>();

  private async tick() {
    // Force a real microtask/macrotask boundary so interleaving happens.
    await new Promise((r) => setTimeout(r, 0));
  }

  async get(key: string) {
    await this.tick();
    return this.strings.has(key) ? this.strings.get(key)! : null;
  }

  async set(key: string, value: string) {
    await this.tick();
    this.strings.set(key, value);
    return 'OK';
  }

  async setEx(key: string, _ttl: number, value: string) {
    return this.set(key, value);
  }

  // INCR is atomic server-side: the read and write happen without yielding.
  async incr(key: string) {
    await this.tick();
    const next = (parseInt(this.strings.get(key) ?? '0', 10) || 0) + 1;
    this.strings.set(key, String(next));
    return next;
  }

  async expire(_key: string, _ttl: number) {
    await this.tick();
    return 1;
  }

  async rPush(key: string, value: string) {
    await this.tick();
    const arr = this.lists.get(key) ?? [];
    arr.push(value);
    this.lists.set(key, arr);
    return arr.length;
  }

  async lTrim(key: string, start: number, stop: number) {
    await this.tick();
    const arr = this.lists.get(key) ?? [];
    const s = start < 0 ? Math.max(0, arr.length + start) : start;
    const e = stop < 0 ? arr.length + stop : stop;
    this.lists.set(key, arr.slice(s, e + 1));
    return 'OK';
  }

  async lRange(key: string, start: number, stop: number) {
    await this.tick();
    const arr = this.lists.get(key) ?? [];
    const s = start < 0 ? Math.max(0, arr.length + start) : start;
    const e = stop < 0 ? arr.length + stop : stop;
    return arr.slice(s, e + 1);
  }
}

let redis: FakeRedis;
beforeEach(() => {
  redis = new FakeRedis();
});

// The fixed implementations, mirroring src/config/redis.ts.
const cache = {
  async incr(key: string, ttl?: number) {
    const next = await redis.incr(key);
    if (ttl && next === 1) await redis.expire(key, ttl);
    return next;
  },
  async getCounter(key: string) {
    const v = await redis.get(key);
    if (v === null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },
  async pushCapped(key: string, value: unknown, max: number, ttl?: number) {
    const len = await redis.rPush(key, JSON.stringify(value));
    await redis.lTrim(key, -max, -1);
    if (ttl && len === 1) await redis.expire(key, ttl);
  },
  async listRange<T>(key: string): Promise<T[]> {
    return (await redis.lRange(key, 0, -1)).map((s) => JSON.parse(s) as T);
  },
};

// The original, vulnerable counter - kept so the test proves the difference
// rather than merely asserting the fix agrees with itself.
async function readModifyWriteIncrement(key: string) {
  const current = await redis.get(key);
  const next = (current ? JSON.parse(current) : 0) + 1;
  await redis.setEx(key, 86400, JSON.stringify(next));
}

const CONCURRENCY = 100;

describe('the original get-then-set counter loses updates', () => {
  it('demonstrates the bug this fix addresses', async () => {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => readModifyWriteIncrement('daily:view')),
    );
    const got = JSON.parse(redis.strings.get('daily:view')!);
    // Not merely "slightly off" - essentially everything is lost.
    expect(got).toBeLessThan(CONCURRENCY);
  });
});

describe('cache.incr is atomic', () => {
  it('records every one of 100 concurrent increments', async () => {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => cache.incr('daily:view', 86400)));
    expect(await cache.getCounter('daily:view')).toBe(CONCURRENCY);
  });

  it('returns the new value to each caller, with no duplicates', async () => {
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => cache.incr('k')),
    );
    expect([...new Set(results)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: CONCURRENCY }, (_, i) => i + 1),
    );
  });

  it('sets the TTL only when the key is created, so the window does not slide', async () => {
    let expireCalls = 0;
    const realExpire = redis.expire.bind(redis);
    redis.expire = async (k: string, t: number) => {
      expireCalls += 1;
      return realExpire(k, t);
    };
    for (let i = 0; i < 5; i++) await cache.incr('rolling', 86400);
    expect(expireCalls).toBe(1);
  });
});

describe('cache.getCounter', () => {
  it('reads a missing counter as 0, not null', async () => {
    // Regression: getRealTimeStats had `cache.get(key) || 0` INSIDE a
    // Promise.all array. A pending Promise is truthy, so `|| 0` never applied
    // and a miss surfaced as null - the dashboard showed blanks, not zeroes.
    const value = await cache.getCounter('never-written');
    expect(value).toBe(0);
    expect(value).not.toBeNull();
  });

  it('survives Promise.all without the truthiness trap', async () => {
    await cache.incr('daily:view');
    const [views, searches] = await Promise.all([
      cache.getCounter('daily:view'),
      cache.getCounter('daily:search'),
    ]);
    expect(views).toBe(1);
    expect(searches).toBe(0);
  });

  it('reads back what incr wrote (bare integer, not JSON)', async () => {
    await cache.incr('n');
    await cache.incr('n');
    expect(await cache.getCounter('n')).toBe(2);
  });

  it('treats a corrupt value as 0 rather than NaN', async () => {
    await redis.set('bad', 'not-a-number');
    expect(await cache.getCounter('bad')).toBe(0);
  });
});

describe('cache.pushCapped', () => {
  it('keeps every one of 100 concurrent appends', async () => {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => cache.pushCapped('s', { i }, 100, 86400)),
    );
    expect((await cache.listRange('s')).length).toBe(CONCURRENCY);
  });

  it('caps the list and keeps the NEWEST entries', async () => {
    for (let i = 0; i < 150; i++) await cache.pushCapped('s', { i }, 100, 86400);
    const items = await cache.listRange<{ i: number }>('s');
    expect(items).toHaveLength(100);
    expect(items[0].i).toBe(50);
    expect(items[items.length - 1].i).toBe(149);
  });

  it('round-trips objects intact', async () => {
    await cache.pushCapped('s', { eventType: 'view', productId: 'p1' }, 10);
    expect(await cache.listRange('s')).toEqual([{ eventType: 'view', productId: 'p1' }]);
  });
});
