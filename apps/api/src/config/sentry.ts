import * as Sentry from '@sentry/node';
import { env } from './environment';

/**
 * Optional error tracking.
 *
 * The store-builder installs onto client servers and many of them have
 * no error-tracking account, so Sentry is strictly opt-in via
 * SENTRY_DSN. With no DSN nothing is initialised, nothing is exported,
 * and the request handlers below are no-ops - the app must run
 * identically with or without it.
 */
let enabled = false;

export function initSentry(): void {
  if (!env.SENTRY_DSN || enabled) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // httpIntegration() creates the per-request spans and
    // expressIntegration() binds them to per-request isolation scopes
    // (v8+ replacement for the old Handlers.requestHandler), so a
    // captureException() inside a route or the error handler lands on
    // the right request.
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    // 10% of transactions get traces; errors are always captured.
    // Raise tracesSampleRate for launch week on a client install.
    tracesSampleRate: 0.1,
    // The server log already carries structured errors; sending both
    // doubles the noise in the Sentry issue stream.
    denyUrls: [/\/health$/],
  });
  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export { Sentry };
