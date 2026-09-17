// ---------------------------------------------------------------------------
// Rate-limit policy.
//
// Two problems this file exists to solve, both found in the September 2026
// audit (docs/AUDIT_2026-09.md):
//
//   1. ONE budget for the whole /api/ surface. A single storefront page view
//      makes ~8 calls (settings, menus, categories, products, banners...), so
//      a 100-per-15-minutes budget locked a real shopper out after roughly a
//      dozen pages. The old code worked around this by skipping GETs — but
//      ONLY in development, so production kept the broken behaviour.
//
//   2. Everything keyed on req.ip. Behind a reverse proxy (which every real
//      deployment uses — see docs/DEPLOYMENT.md) req.ip is the PROXY's address
//      unless Express is told to trust the X-Forwarded-For header. Every
//      visitor then shares one bucket and the store 429s the entire internet
//      after a dozen page views.
//
// The shape of the answer: three budgets sized to what each class of traffic
// actually costs, and an explicit trust-proxy setting so the budgets apply to
// real clients.
// ---------------------------------------------------------------------------
import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { env, isDevelopment, isTest } from './environment';

/** Window shared by all three budgets (default 15 minutes). */
export const WINDOW_MS = parseInt(env.RATE_LIMIT_WINDOW_MS, 10) || 900_000;

/**
 * Per-class budgets, per window, per client.
 *
 * READS are cheap and are what page loads are made of: ~8 per page view, so
 * 1000 is roughly 125 page views per 15 minutes — generous for a human,
 * still a ceiling for a scraper.
 *
 * WRITES are the expensive, state-changing calls (checkout, cart, reviews).
 * RATE_LIMIT_MAX keeps its meaning here, so an operator who already tuned
 * that variable still controls the budget that matters.
 *
 * AUTH is deliberately tight. It is a second line behind utils/authThrottle
 * (which locks a specific email after 5 failures): this one caps how fast a
 * single client can even attempt, including against many different emails.
 */
export const READ_MAX = parseInt(process.env.RATE_LIMIT_READ_MAX || '', 10) || 1000;
export const WRITE_MAX = parseInt(env.RATE_LIMIT_MAX, 10) || 100;
export const AUTH_MAX = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '', 10) || 20;

/**
 * How many proxies sit in front of the API.
 *
 * Express's `trust proxy` decides which entry of X-Forwarded-For becomes
 * req.ip. Getting this WRONG IN EITHER DIRECTION is a real bug:
 *
 *   - too low (the old default, 0/false): req.ip is the proxy, so every
 *     visitor shares one rate-limit bucket and one auth-throttle bucket.
 *     The limiter becomes a store-wide kill switch.
 *
 *   - `true` (trust everything): a client can forge X-Forwarded-For and get
 *     a fresh bucket per request, which removes the limit entirely AND
 *     poisons the audit/consent IPs recorded at auth and newsletter signup.
 *
 * So it is an explicit count, not a boolean. TRUST_PROXY_HOPS=1 is right for
 * the single nginx/Caddy/Traefik in docs/DEPLOYMENT.md; behind Cloudflare in
 * front of that nginx it is 2. Default 0 = direct exposure, which is also the
 * safe answer when nobody has thought about it: the limit is over-strict for
 * shared-NAT visitors rather than forgeable.
 */
export function trustProxyHops(raw: string | undefined = process.env.TRUST_PROXY_HOPS): number {
  if (raw === undefined || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

/** True for requests that only read state. HEAD/OPTIONS ride along with GET. */
export function isReadRequest(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

/**
 * Paths that must use the AUTH budget, matched against the path as seen by a
 * limiter mounted at the app root (so the /api prefix is present).
 *
 * Login/register/forgot/reset are the brute-force and mailbox-bombing
 * surfaces. /auth/me and /auth/refresh are deliberately NOT here: they are
 * ordinary authenticated reads that a browsing session makes constantly, and
 * putting them on a 20-per-window budget would log active shoppers out.
 */
const AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

export function isAuthPath(path: string): boolean {
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  return AUTH_PATHS.includes(clean);
}

/**
 * Which budget a request belongs to. Exported so a unit test can pin the
 * classification without standing up an Express app.
 */
export type Budget = 'auth' | 'read' | 'write';

export function classify(method: string, path: string): Budget {
  // Auth wins over read/write: a POST /login is a write, but it needs the
  // tighter budget, and an OPTIONS preflight to it should not be throttled
  // as auth — preflights carry no credentials.
  if (isAuthPath(path) && !isReadRequest(method)) return 'auth';
  return isReadRequest(method) ? 'read' : 'write';
}

function message(retryAfterMs: number) {
  return {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMITED',
    retryAfter: Math.ceil(retryAfterMs / 1000),
  };
}

function build(max: number, name: Budget): RateLimitRequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    max,
    message: message(WINDOW_MS),
    standardHeaders: true,
    legacyHeaders: false,
    // Separate counters per budget: express-rate-limit keys on IP, so without
    // a prefix the three limiters would share one store and a shopper's reads
    // would eat the checkout budget.
    keyGenerator: (req: Request) => `${name}:${req.ip}`,
  });
}

/**
 * The /api/ rate limiter: classifies each request and applies the matching
 * budget.
 *
 * Disabled entirely under NODE_ENV=test — the integration suite fires
 * thousands of requests from one address and would otherwise throttle itself
 * into flaky failures.
 */
export function createApiRateLimiter() {
  const limiters: Record<Budget, RateLimitRequestHandler> = {
    // Development keeps a deliberately huge read budget so a hot-reloading
    // storefront never fights the limiter; writes and auth stay realistic so
    // the behaviour a developer sees matches production.
    read: build(isDevelopment ? 100_000 : READ_MAX, 'read'),
    write: build(WRITE_MAX, 'write'),
    auth: build(AUTH_MAX, 'auth'),
  };

  return function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
    if (isTest) return next();
    return limiters[classify(req.method, req.originalUrl || req.url)](req, res, next);
  };
}
