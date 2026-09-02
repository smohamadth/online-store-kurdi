/**
 * Sentry (optional error tracking) for the storefront.
 *
 * The store-builder installs onto client servers, many of which have no
 * error-tracking account: with no NEXT_PUBLIC_SENTRY_DSN set, Sentry is
 * a complete no-op and the app builds and runs identically without it.
 *
 * Note: NEXT_PUBLIC_ means the DSN also ships to the browser bundle.
 * That is how @sentry/nextjs is designed (browser DSNs are public and
 * rate-limited by Sentry); server-only tracking is covered by the API's
 * own SENTRY_DSN (apps/api).
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
