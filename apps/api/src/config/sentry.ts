import * as Sentry from '@sentry/node';
import { redactUrl } from '../utils/redact';
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
    // Scrub credentials out of anything leaving the process.
    //
    // Sentry's http integration reports the request URL with its query
    // string, and one-click links (the newsletter unsubscribe token) put a
    // live credential there. Without this, enabling Sentry ships those
    // tokens to a third party - a worse leak than the local log, because it
    // crosses a trust boundary.
    beforeSend(event) {
      try {
        if (event.request?.url) {
          event.request.url = redactUrl(event.request.url);
        }
        if (event.request?.query_string) {
          const qs = event.request.query_string;
          event.request.query_string =
            typeof qs === 'string'
              ? redactUrl(`?${qs}`).replace(/^\?/, '')
              : qs;
        }
        if (Array.isArray(event.breadcrumbs)) {
          for (const b of event.breadcrumbs) {
            if (typeof b.data?.url === 'string') b.data.url = redactUrl(b.data.url);
          }
        }
      } catch {
        // Never let scrubbing failure drop the error report itself.
      }
      return event;
    },
  });
  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export { Sentry };
