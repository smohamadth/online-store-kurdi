import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Simple CSRF token implementation
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

// Route to get CSRF token
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
