/**
 * csrf.ts — token minting/verifying and the express middleware.
 *
 * The middleware allows POST/PUT/PATCH/DELETE only when the request
 * carries a JWT (Bearer) or a valid (sessionId, csrfToken) pair. The
 * tokens live in the CsrfToken table (durable + multi-instance safe),
 * so the tests run against the mock prisma: both paths, the expiry,
 * the sessionId auto-creation in the token route, and the expired-row
 * sweep on mint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma, resetMockPrisma } from '../../helpers/mockPrisma';

vi.mock('../../../src/config/database', () => ({
  prisma: mockPrisma,
  connectDatabase: async () => {},
  disconnectDatabase: async () => {},
}));

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
  beforeEach(async () => { await resetMockPrisma(); });

  it('mints a token, stores it in the DB, and verifies it against the same sessionId', async () => {
    const t = await generateCsrfToken('sess-1');
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(20);
    // The durability contract: the token is a CsrfToken row, not memory.
    const rows = await mockPrisma.csrfToken.findMany({ where: { sessionId: 'sess-1' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(t);
    expect(await verifyCsrfToken('sess-1', t)).toBe(true);
  });

  it('refreshes the same session row on re-mint (one row per session)', async () => {
    const first = await generateCsrfToken('sess-1');
    const second = await generateCsrfToken('sess-1');
    expect(second).not.toBe(first);
    const rows = await mockPrisma.csrfToken.findMany({ where: { sessionId: 'sess-1' } });
    expect(rows).toHaveLength(1);
    expect(await verifyCsrfToken('sess-1', second)).toBe(true);
    // The replaced token no longer verifies.
    expect(await verifyCsrfToken('sess-1', first)).toBe(false);
  });

  it('rejects a token issued for a different session', async () => {
    await generateCsrfToken('sess-A');
    expect(await verifyCsrfToken('sess-B', 'anything')).toBe(false);
  });

  it('returns false for an unknown sessionId', async () => {
    expect(await verifyCsrfToken('nope', 'whatever')).toBe(false);
  });

  it('rejects an expired token and removes the row', async () => {
    await generateCsrfToken('sess-x');
    // 65 minutes in the future
    const originalNow = Date.now;
    Date.now = () => originalNow() + 65 * 60 * 1000;
    try {
      expect(await verifyCsrfToken('sess-x', 'whatever')).toBe(false);
      // The expired row is deleted, not kept around.
      const rows = await mockPrisma.csrfToken.findMany({ where: { sessionId: 'sess-x' } });
      expect(rows).toHaveLength(0);
    } finally {
      Date.now = originalNow;
    }
  });

  it('sweeps expired rows when minting a fresh token', async () => {
    // An expired row for another session...
    await mockPrisma.csrfToken.create({
      data: { sessionId: 'old', token: 't', expiresAt: new Date(Date.now() - 1000) },
    });
    // ...is gone after a mint (lazy sweep).
    await generateCsrfToken('fresh');
    const rows = await mockPrisma.csrfToken.findMany({ where: { sessionId: 'old' } });
    expect(rows).toHaveLength(0);
  });
});

describe('csrfProtection middleware', () => {
  beforeEach(async () => { await resetMockPrisma(); });

  it('skips GET requests', async () => {
    const { req, res } = mockReqRes({ method: 'GET' });
    const next = vi.fn();
    await csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('skips JWT-authed mutating requests (the API uses bearer auth)', async () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer abc' },
    });
    const next = vi.fn();
    await csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a mutating request without session + csrf', async () => {
    const { req, res } = mockReqRes({ method: 'POST', headers: {} });
    const next = vi.fn();
    await csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CSRF_ERROR', message: 'CSRF token missing' }),
    );
  });

  it('rejects when only the session id is present', async () => {
    const { req, res } = mockReqRes({
      method: 'PUT',
      headers: { 'x-session-id': 's1' },
    });
    const next = vi.fn();
    await csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects when the token does not match', async () => {
    await generateCsrfToken('s1');
    const { req, res } = mockReqRes({
      method: 'POST',
      headers: { 'x-session-id': 's1', 'x-csrf-token': 'wrong' },
    });
    const next = vi.fn();
    await csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid CSRF token' }),
    );
  });

  it('accepts a valid session + csrf pair', async () => {
    const t = await generateCsrfToken('s1');
    const { req, res } = mockReqRes({
      method: 'POST',
      headers: { 'x-session-id': 's1', 'x-csrf-token': t },
    });
    const next = vi.fn();
    await csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('csrfTokenRoute', () => {
  beforeEach(async () => { await resetMockPrisma(); });

  it('returns a sessionId + token pair, minting a sessionId if absent', async () => {
    const { req, res } = mockReqRes();
    await csrfTokenRoute(req, res);
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe('success');
    expect(typeof body.data.sessionId).toBe('string');
    expect(typeof body.data.csrfToken).toBe('string');
    // And it verifies.
    expect(await verifyCsrfToken(body.data.sessionId, body.data.csrfToken)).toBe(true);
  });

  it('reuses a client-supplied sessionId', async () => {
    const { req, res } = mockReqRes({ headers: { 'x-session-id': 'fixed' } });
    await csrfTokenRoute(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.data.sessionId).toBe('fixed');
  });
});
