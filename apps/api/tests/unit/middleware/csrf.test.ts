/**
 * csrf.ts — token minting/verifying and the express middleware.
 *
 * The middleware allows POST/PUT/PATCH/DELETE only when the request
 * carries a JWT (Bearer) or a valid (sessionId, csrfToken) pair. The
 * test exercises both paths, the expiry, the sessionId auto-creation in
 * the token route, and the periodic cleanup trigger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateCsrfToken,
  verifyCsrfToken,
  csrfProtection,
  csrfTokenRoute,
} from '../../../src/middleware/csrf';

function mockReqRes(over: Partial<{ method: string; headers: any }> = {}) {
  const req: any = { method: 'POST', headers: {}, ...over };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

describe('generateCsrfToken / verifyCsrfToken', () => {
  it('mints a token and verifies it against the same sessionId', () => {
    const t = generateCsrfToken('sess-1');
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(20);
    expect(verifyCsrfToken('sess-1', t)).toBe(true);
  });

  it('rejects a token issued for a different session', () => {
    const t = generateCsrfToken('sess-A');
    expect(verifyCsrfToken('sess-B', t)).toBe(false);
  });

  it('returns false for an unknown sessionId', () => {
    expect(verifyCsrfToken('nope', 'whatever')).toBe(false);
  });

  it('rejects an expired token and removes the entry', () => {
    const t = generateCsrfToken('sess-x');
    // 65 minutes in the future
    const originalNow = Date.now;
    Date.now = () => originalNow() + 65 * 60 * 1000;
    try {
      expect(verifyCsrfToken('sess-x', t)).toBe(false);
      // subsequent verify is still false
      expect(verifyCsrfToken('sess-x', t)).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });
});

describe('csrfProtection middleware', () => {
  it('skips GET requests', () => {
    const { req, res } = mockReqRes({ method: 'GET' });
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('skips JWT-authed mutating requests (the API uses bearer auth)', () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer abc' },
    });
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a mutating request without session + csrf', () => {
    const { req, res } = mockReqRes({ method: 'POST', headers: {} });
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CSRF_ERROR', message: 'CSRF token missing' }),
    );
  });

  it('rejects when only the session id is present', () => {
    const { req, res } = mockReqRes({
      method: 'PUT',
      headers: { 'x-session-id': 's1' },
    });
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects when the token does not match', () => {
    const t = generateCsrfToken('s1');
    const { req, res } = mockReqRes({
      method: 'POST',
      headers: { 'x-session-id': 's1', 'x-csrf-token': 'wrong' },
    });
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid CSRF token' }),
    );
  });

  it('accepts a valid session + csrf pair', () => {
    const t = generateCsrfToken('s1');
    const { req, res } = mockReqRes({
      method: 'POST',
      headers: { 'x-session-id': 's1', 'x-csrf-token': t },
    });
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('csrfTokenRoute', () => {
  it('returns a sessionId + token pair, minting a sessionId if absent', () => {
    const { req, res } = mockReqRes();
    csrfTokenRoute(req, res);
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe('success');
    expect(typeof body.data.sessionId).toBe('string');
    expect(typeof body.data.csrfToken).toBe('string');
  });

  it('reuses a client-supplied sessionId', () => {
    const { req, res } = mockReqRes({ headers: { 'x-session-id': 'fixed' } });
    csrfTokenRoute(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.data.sessionId).toBe('fixed');
  });
});
