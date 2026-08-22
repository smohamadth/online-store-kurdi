import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration for the API.
 *
 * Uses the in-memory SQLite database by default. `pool: 'forks'` gives each
 * test file its own process so the prisma client (and the in-memory db) is
 * fully isolated - parallel test files otherwise share state via the prisma
 * client and corrupt each other's transactions.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // A worker timeout that is comfortable for cold start + db migration
    // + bcrypt (10 rounds) across many requests.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 1 worker is enough for the suites we have; bump CI parallelism in
    // the npm script if needed.
    pool: 'forks',
    poolOptions: {
      forks: {
        // Single fork is the safest default for stateful tests; the
        // suite is fast enough.
        singleFork: true,
      },
    },
    // Show useful error diffs in failure messages.
    reporters: process.env.CI ? ['default'] : ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/config/database.ts',
        'src/config/redis.ts',
        'src/config/minio.ts',
        'src/config/environment.ts',
        'src/services/email.service.ts',
        'src/services/storage.service.ts',
        'src/services/payment.service.ts',
        'src/server.ts',
        'src/**/types.ts',
        'src/utils/logger.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
