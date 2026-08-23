/**
 * Vitest config for component and provider tests.
 *
 * Split from `vitest.config.ts` so the fast lib-only suite stays the
 * default `npm test`. Run with `npm run test:components`.
 *
 * Why a separate config:
 *   - happy-dom + RTL + react is enough to mount everything we need.
 *   - jsdom would also work but the existing lib tests already use
 *     happy-dom, so we stay consistent.
 *   - We include both `components/**\/*.test.tsx` AND a narrow set of
 *     lib hooks/providers (store.tsx, theme.tsx, i18n.ts). The lib
 *     utility files are still covered by the fast suite.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: [
      'components/**/*.test.{ts,tsx}',
      'lib/store.test.{ts,tsx}',
      'lib/theme.test.{ts,tsx}',
      'lib/i18n.test.{ts,tsx}',
      'app/admin/products/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['./test/setup-components.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  esbuild: {
    // The project tsconfig sets `jsx: "preserve"` for Next; override to
    // automatic so vitest can render components without each file having
    // to `import React from 'react'`.
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
});
