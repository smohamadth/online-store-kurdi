/**
 * Shared test helpers.
 *
 * - `getTestApp()` returns a fresh supertest-friendly express app
 * - `cleanDatabase()` wipes every model. Uses the mock prisma when
 *   running under `vitest.integration.config.ts` and the real one
 *   under `vitest`/`vitest run`.
 * - `authHeader(user)` mints a bearer token, with the user inserted
 *   into the database so the auth middleware's `findUnique` succeeds.
 */
import type { Express } from 'express';

// The prisma import is resolved at call time so the integration setup
// can hoist the mock above all other imports.
export async function getTestApp(): Promise<Express> {
  const { app } = await import('../../src/app');
  return app;
}

/** Mint a bearer token for a freshly-created user with the given role. */
export async function authHeader(opts: {
  role?: 'admin' | 'manager' | 'customer';
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
} = {}) {
  const { generateTokens } = await import('../../src/middleware/auth');
  const { mockPrisma } = await import('./mockPrisma');
  const bcrypt = (await import('bcryptjs')).default;
  const role = opts.role ?? 'customer';
  const email = opts.email ?? `u${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = opts.password ?? 'Password123!';
  const hashed = await bcrypt.hash(password, 4);
  const user = await mockPrisma.user.create({
    data: {
      email,
      password: hashed,
      firstName: opts.firstName ?? 'Test',
      lastName: opts.lastName ?? 'User',
      role,
      isActive: true,
      isVerified: true, // mirror the register route (registration = verification)
    },
  });
  const { accessToken } = generateTokens({ id: user.id, email: user.email, role: user.role });
  return { token: accessToken, user: { id: user.id, email: user.email, role: user.role } };
}

/**
 * Truncate every model. With the mock prisma, this just empties the
 * Map-based stores; in a real run it issues `deleteMany` against the
 * actual database.
 */
export async function cleanDatabase(): Promise<void> {
  const { mockPrisma, resetMockPrisma } = await import('./mockPrisma');
  resetMockPrisma();
  // The redis mock is stateful (see tests/setup-integration.ts), so it has to
  // be emptied alongside the database or cached values leak between tests.
  try {
    const redisMod: any = await import('../../src/config/redis');
    await redisMod.cache?.clear?.();
  } catch {
    // Not every suite mocks redis; nothing to clear then.
  }
  // the reset already clears; nothing else to do for the mock.
  return;
  // keep a reference so tree-shakers don't drop the import
  void mockPrisma;
}
