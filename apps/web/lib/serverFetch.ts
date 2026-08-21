/**
 * Server-side fetch to the store API with loopback fallbacks.
 *
 * WHY THIS EXISTS
 * ---------------
 * "Published page shows Page not found" was reported again with the page
 * verifiably published and the admin list loading fine. The split:
 *
 *   browser  -> API : works   (browsers try EVERY address localhost resolves
 *                            to - ::1 first, then 127.0.0.1 - and use the
 *                            first that connects)
 *   Next srv -> API : fails   (Node's fetch uses the FIRST resolved address
 *                            only, and on many machines /etc/hosts and
 *                            Windows list `::1 localhost` BEFORE
 *                            `127.0.0.1 localhost`)
 *
 * So when the API's IPv6 listener is absent (explicit HOST set in apps/api,
 * the [::1] twin bind refused, an older process, or a VPN/proxy tool eating
 * one address family), every SERVER-side fetch dies while the storefront
 * looks perfectly healthy from the browser. The old code turned that into a
 * silent "Page not found".
 *
 * WHAT THIS DOES
 * --------------
 * For a loopback base URL, fetch tries the configured spelling first, then
 * the other spellings (127.0.0.1 / localhost / [::1]) — but ONLY retries on
 * network-level failures (connection refused, timeout, DNS). Any HTTP
 * response, including 404 and 500, counts as "connected" and is returned
 * as-is, so behaviour beyond connectivity is unchanged. A non-loopback base
 * (a deployed API URL) is fetched exactly once, verbatim.
 *
 * When a fallback connects, a single console.warn names the working URL so
 * the terminal explains the environment quirk instead of hiding it.
 *
 * Edge-runtime safe: plain fetch + URL, no 'use client', no Node APIs.
 */

const CONFIGURED_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Hostnames that all mean "this machine". */
const LOOPBACK_SPELLINGS: Record<string, string[]> = {
  localhost: ['127.0.0.1', '[::1]'],
  '127.0.0.1': ['localhost', '[::1]'],
  '[::1]': ['localhost', '127.0.0.1'],
  '::1': ['localhost', '127.0.0.1'],
};

function candidateBases(base: string): string[] {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return [base];
  }
  const alternates = LOOPBACK_SPELLINGS[url.hostname];
  if (!alternates) return [base];

  const out = [base];
  for (const host of alternates) {
    const u = new URL(base);
    u.hostname = host;
    // URL.toString() keeps protocol, port and path; strip a trailing slash
    // so `${base}${path}` concatenation in callers stays clean.
    out.push(u.toString().replace(/\/$/, ''));
  }
  return out;
}

const BASES = candidateBases(CONFIGURED_BASE);

/**
 * Fetch `${apiBase}${path}` from the server, falling back across loopback
 * spellings on network failure. `path` must start with '/'.
 */
export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < BASES.length; i++) {
    const base = BASES[i];
    try {
      const res = await fetch(`${base}${path}`, init);
      if (i > 0) {
        // Reachable only via a different spelling than configured — say so,
        // once, where the developer will see it.
        console.warn(
          `[serverFetch] ${CONFIGURED_BASE} was unreachable; served by ${base}. ` +
            'Consider setting NEXT_PUBLIC_API_URL to the working address.'
        );
      }
      return res;
    } catch (err) {
      lastError = err;
      // Network-level failure — try the next spelling.
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
