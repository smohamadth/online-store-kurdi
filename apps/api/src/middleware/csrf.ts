// ---------------------------------------------------------------------------
// CSRF double-submit protection.
//
// MOUNT STATUS: the token-issuing route is mounted (app.ts:
// GET /api/csrf-token), but the csrfProtection middleware is NOT -
// deliberately. Every authenticated mutation in this API uses a Bearer
// JWT in the Authorization header, and a cross-site form cannot read or
// attach that header (CORS blocks it), so those routes are CSRF-immune
// without this middleware. The web client also does not use the
// x-session-id/x-csrf-token flow. Mounting the guard today would 403 the
// unauthenticated POSTs the storefront sends (contact, newsletter,
// stock alerts, auth) - it can only be enabled together with a client
// that fetches /api/csrf-token and echoes the headers.
//
// The token store is a table (CsrfToken), not module memory, so that
// future mount is safe on a multi-instance API: tokens issued on one
// instance verify on another, and a deploy no longer invalidates them.
// One row per sessionId; minting refreshes token + expiry; expired rows
// are swept lazily (on mint and on failed verify).
// ---------------------------------------------------------------------------
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/database';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Lazily drop expired rows. One indexed deleteMany per mint is cheap and
// keeps the table bounded without a scheduler.
async function sweepExpired(): Promise<void> {
  await prisma.csrfToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

// Issue (or refresh) the CSRF token for a session.
export async function generateCsrfToken(sessionId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await sweepExpired();
  await prisma.csrfToken.upsert({
    where: { sessionId },
    create: { sessionId, token, expiresAt },
    update: { token, expiresAt },
  });
  return token;
}

// Verify a (sessionId, token) pair. Returns false (and deletes the row
// when it is expired) for unknown sessions, expired tokens, and mismatches.
export async function verifyCsrfToken(sessionId: string, token: string): Promise<boolean> {
  const stored = await prisma.csrfToken.findUnique({ where: { sessionId } });
  if (!stored) return false;
  if (stored.expiresAt.getTime() < Date.now()) {
    await prisma.csrfToken.delete({ where: { id: stored.id } });
    return false;
  }
  return stored.token === token;
}

// Middleware to check CSRF token for state-changing requests. See the
// header for why it is currently not mounted.
export async function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only check for state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // Skip CSRF for API endpoints that use JWT auth
    // JWT tokens in Authorization header provide sufficient protection
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next();
    }

    // For non-authenticated requests, check CSRF token
    const sessionId = req.headers['x-session-id'] as string;
    const csrfToken = req.headers['x-csrf-token'] as string;

    if (!sessionId || !csrfToken) {
      return res.status(403).json({
        status: 'error',
        message: 'CSRF token missing',
        code: 'CSRF_ERROR',
      });
    }

    if (!(await verifyCsrfToken(sessionId, csrfToken))) {
      return res.status(403).json({
        status: 'error',
        message: 'Invalid CSRF token',
        code: 'CSRF_ERROR',
      });
    }
  }

  next();
}

// Route to get a CSRF token (mounted in app.ts). The client stores the
// pair and echoes it as X-Session-Id / X-Csrf-Token headers - required
// only if/when csrfProtection is mounted.
export async function csrfTokenRoute(req: Request, res: Response) {
  const sessionId = req.headers['x-session-id'] as string || crypto.randomBytes(16).toString('hex');
  const token = await generateCsrfToken(sessionId);

  res.json({
    status: 'success',
    data: {
      sessionId,
      csrfToken: token,
    },
  });
}

export default csrfProtection;
