// ---------------------------------------------------------------------------
// CSRF protection (double-submit token, in-memory).
//
// CURRENT STATE: only the token-issuing route is mounted (app.ts:
// GET /api/csrf-token -> csrfTokenRoute). csrfProtection itself is NOT
// mounted on the app, so this file is a ready-to-enable guard, not an
// active one. The API's real cross-site protection today is the JWT
// Authorization header (a browser form cannot forge it) plus the CORS
// origin allowlist in app.ts. If csrfProtection is ever mounted, mount it
// BEFORE the auth middleware.
// ---------------------------------------------------------------------------
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Simple CSRF token implementation. In-memory on purpose: tokens are
// one-hour throwaways, so surviving a restart is not required.
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

// Generate a CSRF token
export function generateCsrfToken(sessionId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  
  csrfTokens.set(sessionId, { token, expiresAt });
  
  // Clean up expired tokens periodically
  if (csrfTokens.size > 1000) {
    const now = Date.now();
    for (const [key, value] of csrfTokens.entries()) {
      if (value.expiresAt < now) {
        csrfTokens.delete(key);
      }
    }
  }
  
  return token;
}

// Verify a CSRF token
export function verifyCsrfToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  
  if (!stored) return false;
  if (stored.expiresAt < Date.now()) {
    csrfTokens.delete(sessionId);
    return false;
  }
  
  return stored.token === token;
}

// Middleware to check CSRF token for state-changing requests
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only check for state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // Skip CSRF for API endpoints that use JWT auth:
    // a cross-site form cannot read or send the Authorization header
    // (CORS blocks it), so the Bearer token is sufficient protection.
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
    
    if (!verifyCsrfToken(sessionId, csrfToken)) {
      return res.status(403).json({
        status: 'error',
        message: 'Invalid CSRF token',
        code: 'CSRF_ERROR',
      });
    }
  }
  
  next();
}

// Route to get CSRF token - the ONLY csrf route mounted in app.ts
// (GET /api/csrf-token). The browser stores the returned sessionId +
// csrfToken and echoes them as X-Session-Id / X-Csrf-Token headers.
export function csrfTokenRoute(req: Request, res: Response) {
  const sessionId = req.headers['x-session-id'] as string || crypto.randomBytes(16).toString('hex');
  const token = generateCsrfToken(sessionId);
  
  res.json({
    status: 'success',
    data: {
      sessionId,
      csrfToken: token,
    },
  });
}

export default csrfProtection;
