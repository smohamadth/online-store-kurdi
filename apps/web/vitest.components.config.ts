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
    // Preview iframes are inspected via their src; don't launch real network requests from unit tests.
    environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
    onConsoleLog(log) {
      // happy-dom logs its deliberate iframe-loading opt-out as a DOMException.
      // Keep all actual application errors/warnings visible.
      if (log.includes('NotSupportedError') && log.includes('Iframe page loading is disabled.')) return false;
    },
    include: [
      'components/**/*.test.{ts,tsx}',
      'lib/store.test.{ts,tsx}',
      'lib/theme.test.{ts,tsx}',
      'lib/theme-rtl.test.{ts,tsx}',
      'lib/themeSections.test.{ts,tsx}',
      'lib/theme-featured.test.{ts,tsx}',
      'lib/theme-distinctness.test.{ts,tsx}',
      'lib/theme-niche.test.{ts,tsx}',
      'lib/themeConfigSchema.test.{ts,tsx}',
      'lib/layouts/render.test.{ts,tsx}',
      'lib/layouts/useActiveLayout.test.{ts,tsx}',
      'lib/previewTheme.test.{ts,tsx}',
      'lib/i18n.test.{ts,tsx}',
      'lib/hooks.test.{ts,tsx}',
      'lib/useDesignNavigationGuard.test.{ts,tsx}',
      'app/**/*.test.{ts,tsx}',
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
