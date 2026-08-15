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
