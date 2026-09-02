/**
 * The API base URL, safe to import from SERVER components.
 *
 * `lib/http.ts` is marked `'use client'`. When a server component imports
 * `API_BASE` from it, React hands back a client-reference *Symbol* rather than
 * the string, and the first template interpolation throws:
 *
 *     TypeError: Cannot convert a Symbol value to a string
 *
 * That is precisely what broke the soft-404 fix. `categoryExists()` wrapped its
 * fetch in a try/catch that returned `null` ("API error, don't 404 a page that
 * might be valid"), so the thrown Symbol error was swallowed and every unknown
 * category rendered not-found.tsx with HTTP 200. The status was never the
 * problem the second time round - the existence check simply never ran.
 *
 * This module has no `'use client'` directive, so both server and client code
 * can import it and get an actual string. `lib/http.ts` re-exports it, so
 * existing client imports keep working unchanged.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * API base for BROWSER code (re-exported as `API_BASE` from lib/http.ts).
 *
 * A loopback base - the dev default `http://localhost:3001/api` or any
 * 127.0.0.1 variant - is only reachable on the machine where the API
 * process runs, i.e. the server. From a user's browser it points at
 * THEIR machine and every call fails (this is what made proxied/preview
 * deployments appear broken: the page rendered, then all data fetches
 * died). When the configured base is loopback, browser code falls back
 * to the same origin ("/api/...") and the Next server proxies it to the
 * API (see the /api rewrite in next.config.js), where loopback works.
 * Absolute non-loopback bases pass through unchanged.
 */
const LOOPBACK_BASE =
  /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/;
export const CLIENT_API_BASE = LOOPBACK_BASE.test(API_BASE) ? '/api' : API_BASE;
