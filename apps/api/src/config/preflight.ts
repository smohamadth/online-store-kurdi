/**
 * Pre-import guard: is the Prisma client actually generated?
 *
 * `@prisma/client` is a stub that re-exports node_modules/.prisma/client,
 * which `prisma generate` writes. That output is NOT in git and is wiped by
 * `npm install`, `npm ci` and `rm -rf node_modules`. When it is missing, the
 * very first import of ../config/database throws:
 *
 *     Error: Cannot find module '.prisma/client/default'
 *
 * That happens at MODULE LOAD, before any logging, before the existing
 * assertPrismaClientIsCurrent guard, and before the server binds a port. Under
 * `npm run dev` the two processes run through concurrently, which swallows the
 * dying child's stderr - so the only visible symptom is the WEB server
 * reporting ECONNREFUSED on :3001. That points at the wrong process entirely,
 * and the actual cause (one missing command) is invisible.
 *
 * This module must therefore be imported FIRST in server.ts, before anything
 * that reaches @prisma/client. It uses require() rather than a static import
 * so the resolution failure is catchable instead of fatal.
 */

/** Human-readable remediation, kept separate so tests can assert on it. */
export const PRISMA_CLIENT_MISSING_HELP = [
  '',
  '  x The Prisma client has not been generated.',
  '',
  '    The API cannot start: every database call needs the client that',
  '    `prisma generate` writes into node_modules/.prisma. It is not stored',
  '    in git, and npm install / npm ci remove it.',
  '',
  '    Fix:',
  '',
  '      cd apps/api && npx prisma generate',
  '',
  '    If that fails to download its engine (a proxy or firewall blocking',
  '    binaries.prisma.sh), set a mirror or allow that host, then retry.',
  '',
].join('\n');

/**
 * True when the generated client can be resolved.
 *
 * Exported for testing; the check itself is a plain require so it reflects
 * exactly what the real import would do.
 */
export function isPrismaClientGenerated(): boolean {
  try {
    // The stub's own entry point. Resolving it is what fails when the
    // generated output is absent.
     
    require.resolve('.prisma/client/default', {
      paths: [require.resolve('@prisma/client')],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Abort with an actionable message if the client is missing.
 *
 * Exits rather than throwing: a stack trace pointing into node's module
 * loader is what made this confusing in the first place.
 */
export function assertPrismaClientGenerated(): void {
  if (isPrismaClientGenerated()) return;
  // Deliberately console.error, not the logger: the logger imports config,
  // which is part of the chain that may be broken here.
  console.error(PRISMA_CLIENT_MISSING_HELP);
  process.exit(1);
}

// Executed on import. Imports are hoisted, so a bare call placed BETWEEN
// import statements in server.ts would not run first - the side effect has to
// live here, in the module that is imported first.
//
// Skipped under a test runner: the tests import this module to assert on the
// message, and a module-scope process.exit(1) would kill the runner before a
// single test executed. (It did, on the first attempt.)
if (process.env.VITEST === undefined && process.env.NODE_ENV !== 'test') {
  assertPrismaClientGenerated();
}
