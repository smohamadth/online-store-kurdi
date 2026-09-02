/**
 * Integration test setup.
 *
 * This file is loaded BEFORE any test code. It uses vi.mock with hoisted
 * to swap the real `database` module for our in-memory mock before any
 * source file is required.
 *
 * To run integration tests:
 *
 *   cd apps/api && npm run test:integration
 *
 * The mock is in tests/helpers/mockPrisma.ts. See its top comment for
 * what it is and is not.
 */
import { vi } from 'vitest';
import { mockDatabaseModule, resetMockPrisma } from './helpers/mockPrisma';

// Set env vars BEFORE any source module is required. The zod schema in
// src/config/environment.ts caches its parsed result on first import.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.API_VERSION = 'v1';
process.env.DATABASE_URL = 'file:./test.db';
process.env.REDIS_URL = 'redis://127.0.0.1:65535';
process.env.JWT_SECRET = 'a'.repeat(48);
process.env.JWT_EXPIRES_IN = '7d';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ACCESS_KEY = 'test-access';
process.env.MINIO_SECRET_KEY = 'test-secret';
process.env.MINIO_BUCKET = 'store-files-test';
process.env.MINIO_USE_SSL = 'false';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.EMAIL_FROM = 'test@example.com';
process.env.FRONTEND_URL = 'http://127.0.0.1:3000';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '100000';
process.env.MAX_FILE_SIZE = '10485760';
process.env.ALLOWED_FILE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
process.env.LOG_LEVEL = 'error';
process.env.LOG_FILE = 'logs/test.log';
process.env.BCRYPT_ROUNDS = '4';
process.env.CORS_ORIGIN = 'http://127.0.0.1:3000';
process.env.REVIEWS_AUTO_APPROVE = 'false';
process.env.PAYMENTS_ALLOW_MOCK = 'false';

/**
 * In-memory stand-in for the `cache` export of src/config/redis.ts.
 *
 * Kept behaviourally faithful (TTLs are ignored - tests do not wait them out):
 * strings and lists are stored separately, incr is atomic, and pushCapped
 * keeps the newest N entries, so code paths that read back what they wrote
 * behave as they would against a real Redis.
 */
// vi.mock factories are hoisted above module-level consts, so the mock and
// its backing stores must be created inside vi.hoisted().
const { cacheMock, resetCacheMock } = vi.hoisted(() => {
const cacheStrings = new Map<string, string>();
const cacheLists = new Map<string, string[]>();

function resetCacheMock() {
  cacheStrings.clear();
  cacheLists.clear();
}

const cacheMock = {
  get: vi.fn(async (key: string) => {
    const v = cacheStrings.get(key);
    return v === undefined ? null : JSON.parse(v);
  }),
  set: vi.fn(async (key: string, value: unknown) => {
    cacheStrings.set(key, JSON.stringify(value));
  }),
  del: vi.fn(async (key: string) => {
    cacheStrings.delete(key);
    cacheLists.delete(key);
  }),
  clear: vi.fn(async () => {
    resetCacheMock();
  }),
  keys: vi.fn(async (pattern: string) => {
    const re = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    );
    return [...cacheStrings.keys(), ...cacheLists.keys()].filter((k) => re.test(k));
  }),
  incr: vi.fn(async (key: string) => {
    const next = (parseInt(cacheStrings.get(key) ?? '0', 10) || 0) + 1;
    cacheStrings.set(key, String(next));
    return next;
  }),
  getCounter: vi.fn(async (key: string) => {
    const v = cacheStrings.get(key);
    if (v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }),
  pushCapped: vi.fn(async (key: string, value: unknown, max: number) => {
    const arr = cacheLists.get(key) ?? [];
    arr.push(JSON.stringify(value));
    cacheLists.set(key, arr.slice(Math.max(0, arr.length - max)));
  }),
  listRange: vi.fn(async (key: string, start = 0, stop = -1) => {
    const arr = cacheLists.get(key) ?? [];
    const s = start < 0 ? Math.max(0, arr.length + start) : start;
    const e = stop < 0 ? arr.length + stop : stop;
    return arr.slice(s, e + 1).map((i) => JSON.parse(i));
  }),
};

return { cacheMock, resetCacheMock };
});

export { resetCacheMock };

vi.mock('../src/config/database', () => mockDatabaseModule);
vi.mock('../../src/config/database', () => mockDatabaseModule); // for tests/helpers/
vi.mock('../src/config/redis', () => ({
  redis: { on: vi.fn(), connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}), get: vi.fn(async () => null), setEx: vi.fn(async () => {}), set: vi.fn(async () => {}), del: vi.fn(async () => {}), flushAll: vi.fn(async () => {}), keys: vi.fn(async () => []), ping: vi.fn(async () => 'PONG') },
  connectRedis: vi.fn(async () => {}),
  disconnectRedis: vi.fn(async () => {}),
  checkRedisHealth: vi.fn(async () => false),
  // A small in-memory cache rather than a set of always-miss stubs. The old
  // stub returned null from get() and swallowed set(), so any caching bug -
  // including a stale entry never being invalidated - was invisible to the
  // integration suite. It also had to be extended by hand whenever a method
  // was added, and a missing one surfaced as "cache.X is not a function" at
  // runtime rather than as a clear failure.
  cache: cacheMock,
  sessionStore: { get: vi.fn(async () => null), set: vi.fn(async () => {}), destroy: vi.fn(async () => {}) },
}));
vi.mock('../src/config/minio', () => ({
  minioClient: { bucketExists: vi.fn(async () => true), makeBucket: vi.fn(async () => {}), setBucketPolicy: vi.fn(async () => {}), putObject: vi.fn(async () => {}), getObject: vi.fn(async () => ({ on: vi.fn() })), removeObject: vi.fn(async () => {}), presignedGetObject: vi.fn(async () => ''), listObjects: vi.fn(() => ({ on: vi.fn() })) },
  BUCKET_NAME: 'test',
  initializeMinIO: vi.fn(async () => {}),
  uploadFile: vi.fn(async () => ''),
  downloadFile: vi.fn(async () => Buffer.alloc(0)),
  deleteFile: vi.fn(async () => {}),
  getPresignedUrl: vi.fn(async () => ''),
  getPublicUrl: vi.fn(() => ''),
  listFiles: vi.fn(async () => []),
}));

// NOTE: `mochaHooks` is a Mocha convention and is NOT honoured by vitest -
// this never ran. Suites reset state explicitly via cleanDatabase() in
// tests/helpers/db.ts, which now clears the cache mock too. Left in place
// (inert) only to avoid touching unrelated exports.
export const mochaHooks = {
  beforeEach: async () => {
    resetMockPrisma();
    resetCacheMock();
  },
};
