/**
 * Redaction for anything written to a log.
 *
 * Logs are copied to shippers, backups and support tickets, and are readable
 * by far more people than the database is. So a credential in a log line is a
 * credential handed out broadly and retained indefinitely.
 *
 * The concrete leak this was written for: the newsletter unsubscribe token
 * travels in the QUERY STRING (it has to - it is a one-click link in an
 * email), and both morgan's access log and the error handler wrote the full
 * request URL verbatim. Every unsubscribe click therefore recorded a live
 * credential that lets the holder opt any customer out.
 *
 * Pure and dependency-free so it can be unit-tested exhaustively, and so the
 * logger can use it without an import cycle.
 */

/** Query parameters whose VALUE must never be logged. */
export const SENSITIVE_PARAMS = [
  'token',
  'access_token',
  'refresh_token',
  'accesstoken',
  'refreshtoken',
  'password',
  'secret',
  'apikey',
  'api_key',
  'key',
  'signature',
  'sig',
  'code',
  'authorization',
  'auth',
  'session',
  'sessionid',
  'session_id',
  'email',
] as const;

export const REDACTED = '[REDACTED]';

function isSensitiveParam(name: string): boolean {
  const n = name.toLowerCase();
  return (SENSITIVE_PARAMS as readonly string[]).includes(n);
}

/**
 * Strip sensitive values from a URL's query string, keeping the shape.
 *
 * The parameter NAME is preserved so a log still shows that a token was
 * supplied - useful for debugging - while the value is replaced. Handles
 * relative URLs (what Express gives us in req.url) as well as absolute ones,
 * and leaves a URL with no query string untouched.
 */
export function redactUrl(url: string): string {
  const raw = String(url ?? '');
  if (!raw) return raw;

  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return raw;

  const path = raw.slice(0, qIndex);
  // Keep any fragment out of the query parsing.
  const afterQ = raw.slice(qIndex + 1);
  const hashIndex = afterQ.indexOf('#');
  const queryPart = hashIndex === -1 ? afterQ : afterQ.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : afterQ.slice(hashIndex);

  if (!queryPart) return raw;

  const redacted = queryPart
    .split('&')
    .map((pair) => {
      if (!pair) return pair;
      const eq = pair.indexOf('=');
      // A bare flag (`?debug`) has no value to leak.
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      return isSensitiveParam(decodeURIComponent(name)) ? `${name}=${REDACTED}` : pair;
    })
    .join('&');

  return `${path}?${redacted}${fragment}`;
}

/**
 * Redact a raw HTTP request line as it appears in a combined access log,
 * e.g. `GET /api/x?token=abc HTTP/1.1`.
 *
 * morgan hands the whole line to the log stream as one string, so the URL has
 * to be found inside it rather than passed separately.
 */
export function redactLogLine(line: string): string {
  const raw = String(line ?? '');
  if (!raw || raw.indexOf('?') === -1) return raw;

  // Replace every URL-ish token that carries a query string. Deliberately
  // conservative: only touches substrings that look like a path with a query.
  return raw.replace(/(\/[^\s"']*\?[^\s"']*)/g, (m) => redactUrl(m));
}

/**
 * Truncate an IP for storage or logging.
 *
 * Full IP addresses are personal data under GDPR. Dropping the last octet
 * (or the low bits of a v6 address) keeps the "roughly where from" signal
 * that analytics actually uses while removing the identifier.
 *
 * Kept here as well as in newsletter.helpers so non-newsletter callers do not
 * have to import from a marketing module; the behaviour is identical.
 */
export function truncateIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const clean = String(ip).replace(/^::ffff:/, '').trim();
  if (!clean) return null;
  if (clean.includes(':')) {
    const parts = clean.split(':').filter(Boolean);
    if (parts.length === 0) return null;
    return parts.slice(0, 3).join(':') + '::';
  }
  const octets = clean.split('.');
  if (octets.length !== 4) return null;
  if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
}
