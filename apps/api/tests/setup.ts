/**
 * Global Vitest setup - runs once before any test.
 *
 * Two modes:
 *   1. Default: the test only needs env vars (middleware, utilities,
 *      frontend). We do NOT try to push a schema.
 *   2. INTEGRATION=1: the test needs the database. We attempt
 *      `prisma db push` and let that fail loudly if the engine isn't
 *      downloadable.
 *
 * Setting env vars MUST happen before the first import of
 * `src/config/environment.ts`, because the zod schema there caches its
 * parsed result on import.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'store-api-tests-'));
const DB_PATH = path.join(TEST_DIR, 'test.db');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.API_VERSION = 'v1';
process.env.DATABASE_URL = `file:${DB_PATH}`;
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
process.env.LOG_FILE = path.join(TEST_DIR, 'app.log');
process.env.BCRYPT_ROUNDS = '4';
process.env.CORS_ORIGIN = 'http://127.0.0.1:3000';
process.env.REVIEWS_AUTO_APPROVE = 'false';
process.env.PAYMENTS_ALLOW_MOCK = 'false';

if (process.env.INTEGRATION === '1') {
  try {
    execSync('npx prisma db push --skip-generate --force-reset', {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env },
      stdio: 'ignore',
    });
  } catch (err) {
    console.error('Failed to prepare integration test database:', err);
    throw err;
  }
}
