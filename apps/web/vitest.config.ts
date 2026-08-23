/**
 * Vitest config for the Next.js storefront.
 *
 * Pure-utility tests (lib/) run under happy-dom so localStorage / window /
 * URL APIs behave like the browser. Component / page tests would need a
 * heavier setup that we do not need for this suite.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    // Pure utility tests only. React component / provider tests live in
    // vitest.components.config.ts which mounts the next/router and
    // next/link stubs.
    include: ['lib/**/*.test.ts'],
    exclude: ['lib/**/*.test.tsx', 'components/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
