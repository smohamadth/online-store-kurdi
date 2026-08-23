import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Integration test config.
 *
 * Runs every file under tests/integration. Each test file gets a clean
 * in-memory prisma store (via the mock in tests/helpers/mockPrisma.ts)
 * because `mockPrisma` is reset in beforeEach.
 *
 * Use this config when you want route-level coverage without needing
 * a real database. The "real" integration tests use the same code
 * paths; only the underlying prisma client is swapped out.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/setup-integration.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
