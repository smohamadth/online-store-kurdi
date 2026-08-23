/**
 * auth middleware.
 *
 * The middleware has two layers:
 *   - JWT sign/verify (pure, easy to test)
 *   - DB lookup (the "is this user real and active?" check)
 *
 * For the DB part we use `vi.mock` to inject a fake `prisma` so this
 * test does not need a real database. The mock is the standard shape
 * the real `prisma.user.findUnique` returns; the assertions confirm the
 * middleware does the right thing in each branch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma BEFORE importing the module under test. The middleware
// captures `prisma` at import time.
const mockPrismaUser = {
  findUnique: vi.fn(),
};
vi.mock('../../../src/config/database', () => ({
  prisma: { user: mockPrismaUser },
}));

// Import after the mock.
const { authenticate, optionalAuth, authorize, generateTokens, verifyRefreshToken } =
  await import('../../../src/middleware/auth');

function makeReq(over: Partial<{ headers: any; user: any }> = {}): any {
  return { headers: {}, ...over };
}
function makeRes(): any {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}
function makeNext() {
  return vi.fn();
}

beforeEach(() => {
  mockPrismaUser.findUnique.mockReset();
});

describe('generateTokens + verifyRefreshToken', () => {
  it('produces distinct access and refresh tokens', () => {
    const { accessToken, refreshToken } = generateTokens({
      id: 'u1',
      email: 'a@b.c',
      role: 'customer',
    });
    expect(typeof accessToken).toBe('string');
    expect(typeof refreshToken).toBe('string');
    expect(accessToken).not.toBe(refreshToken);
  });

  it('a refresh token carries the type=refresh claim', () => {
    const { refreshToken } = generateTokens({ id: 'u1', email: 'a@b.c', role: 'admin' });
    const decoded = verifyRefreshToken(refreshToken);
    expect(decoded.type).toBe('refresh');
    expect((decoded as any).userId).toBe('u1');
  });

  it('two refresh tokens issued in the same millisecond are NOT identical', () => {
    // Regression test for the "second login fails with P2002" bug. The
    // jti claim randomises the payload so two near-simultaneous logins
    // never produce byte-identical refresh tokens.
    const a = generateTokens({ id: 'u1', email: 'a@b.c', role: 'customer' });
    const b = generateTokens({ id: 'u1', email: 'a@b.c', role: 'customer' });
    expect(a.refreshToken).not.toBe(b.refreshToken);
  });

  it('verifyRefreshToken rejects an access token (no type=refresh)', () => {
    const { accessToken } = generateTokens({ id: 'u1', email: 'a@b.c', role: 'customer' });
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  it('verifyRefreshToken rejects a malformed token', () => {
    expect(() => verifyRefreshToken('not.a.jwt')).toThrow();
  });
});

describe('authenticate', () => {
  it('throws UnauthorizedError when no Authorization header is present', async () => {
    const next = makeNext();
    await authenticate(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/No token/);
  });

  it('throws when the header is not a Bearer token', async () => {
    const next = makeNext();
    await authenticate(makeReq({ headers: { authorization: 'Basic xyz' } }), makeRes(), next);
    expect(next.mock.calls[0][0].message).toMatch(/No token/);
  });

  it('attaches the user on a valid token + existing user', async () => {
    const { accessToken } = generateTokens({ id: 'u1', email: 'a@b.c', role: 'customer' });
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      role: 'customer',
      firstName: 'F',
      lastName: 'L',
      isActive: true,
    });
    const req = makeReq({ headers: { authorization: `Bearer ${accessToken}` } });
    const next = makeNext();
    await authenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({
      id: 'u1', email: 'a@b.c', role: 'customer', firstName: 'F', lastName: 'L',
    });
  });

  it('rejects an invalid token with a clean error', async () => {
    const next = makeNext();
    await authenticate(
      makeReq({ headers: { authorization: 'Bearer not.a.jwt' } }),
      makeRes(),
      next,
    );
    expect(next.mock.calls[0][0].message).toMatch(/Invalid token/);
  });

  it('rejects when the user is no longer in the database', async () => {
    const { accessToken } = generateTokens({ id: 'u1', email: 'a@b.c', role: 'customer' });
    mockPrismaUser.findUnique.mockResolvedValue(null);
    const next = makeNext();
    await authenticate(
      makeReq({ headers: { authorization: `Bearer ${accessToken}` } }),
      makeRes(),
      next,
    );
    expect(next.mock.calls[0][0].message).toMatch(/not found/i);
  });

  it('rejects when the user is deactivated', async () => {
    const { accessToken } = generateTokens({ id: 'u1', email: 'a@b.c', role: 'customer' });
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.c', role: 'customer', firstName: 'F', lastName: 'L', isActive: false,
    });
    const next = makeNext();
    await authenticate(
      makeReq({ headers: { authorization: `Bearer ${accessToken}` } }),
      makeRes(),
      next,
    );
    expect(next.mock.calls[0][0].message).toMatch(/deactivated/);
  });
});

describe('optionalAuth', () => {
  it('passes through silently with no auth header', async () => {
    const next = makeNext();
    await optionalAuth(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('attaches user when the token is valid and the user exists', async () => {
    const { accessToken } = generateTokens({ id: 'u1', email: 'a@b.c', role: 'customer' });
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.c', role: 'customer', firstName: 'F', lastName: 'L', isActive: true,
    });
    const req = makeReq({ headers: { authorization: `Bearer ${accessToken}` } });
    const next = makeNext();
    await optionalAuth(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
  });

  it('silently continues when token is invalid (no error)', async () => {
    const req = makeReq({ headers: { authorization: 'Bearer bad' } });
    const next = makeNext();
    await optionalAuth(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });
});

describe('authorize', () => {
  it('rejects when there is no req.user', () => {
    const next = makeNext();
    authorize('admin')(makeReq(), makeRes(), next);
    expect(next.mock.calls[0][0].message).toMatch(/Authentication required/);
  });

  it('rejects when the role is not in the allowed list', () => {
    const next = makeNext();
    const req = makeReq({ user: { id: 'u1', email: 'a', role: 'customer', firstName: 'F', lastName: 'L' } });
    authorize('admin')(req, makeRes(), next);
    expect(next.mock.calls[0][0].message).toMatch(/Insufficient/);
  });

  it('passes through when the role is in the allowed list', () => {
    const next = makeNext();
    const req = makeReq({ user: { id: 'u1', email: 'a', role: 'admin', firstName: 'F', lastName: 'L' } });
    authorize('admin', 'manager')(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
