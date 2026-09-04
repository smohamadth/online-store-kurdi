/**
 * Startup preflight: is the Prisma client generated?
 *
 * Without it the first import of config/database throws
 * "Cannot find module '.prisma/client/default'" at MODULE LOAD - before any
 * logging and before a port is bound. Under `npm run dev` concurrently
 * swallows the dying child's stderr, so the only visible symptom is the WEB
 * server reporting ECONNREFUSED on :3001 - pointing at the wrong process
 * entirely, while the real cause is one missing command.
 *
 * These pin the detection and, more importantly, the quality of the message:
 * the whole value of this guard is that it names the fix.
 */
import { describe, it, expect } from 'vitest';
import {
  isPrismaClientGenerated,
  PRISMA_CLIENT_MISSING_HELP,
} from '../../../src/config/preflight';

describe('isPrismaClientGenerated', () => {
  it('returns a boolean without throwing, either way', () => {
    // It must never throw: it is the thing that runs BEFORE error handling
    // exists, so an exception here would reproduce the very failure it is
    // meant to explain.
    expect(() => isPrismaClientGenerated()).not.toThrow();
    expect(typeof isPrismaClientGenerated()).toBe('boolean');
  });

  it('agrees with whether the generated client can actually be required', () => {
    // Derive the expected answer independently rather than trusting the
    // function's own logic.
    let resolvable = true;
    try {
      require.resolve('.prisma/client/default', {
        paths: [require.resolve('@prisma/client')],
      });
    } catch {
      resolvable = false;
    }
    expect(isPrismaClientGenerated()).toBe(resolvable);
  });
});

describe('the failure message', () => {
  it('names the exact command that fixes it', () => {
    // A guard that says "something is wrong" is barely better than the raw
    // stack trace. The command is the point.
    expect(PRISMA_CLIENT_MISSING_HELP).toContain('npx prisma generate');
  });

  it('explains why the client is missing rather than just that it is', () => {
    expect(PRISMA_CLIENT_MISSING_HELP).toMatch(/npm install|npm ci/);
    expect(PRISMA_CLIENT_MISSING_HELP).toMatch(/not stored[\s\S]*git|git/i);
  });

  it('covers the blocked-download case, which is how people get here', () => {
    // The common route to this state is a proxy blocking the engine host
    // during postinstall - npm then rolls the whole install back.
    expect(PRISMA_CLIENT_MISSING_HELP).toContain('binaries.prisma.sh');
  });

  it('does not mention a stack trace or module resolution', () => {
    // The message replaces node's loader error; echoing its vocabulary would
    // undo the benefit.
    expect(PRISMA_CLIENT_MISSING_HELP).not.toMatch(/MODULE_NOT_FOUND|require stack/i);
  });

  it('is plain text safe to print before the logger exists', () => {
    expect(typeof PRISMA_CLIENT_MISSING_HELP).toBe('string');
    expect(PRISMA_CLIENT_MISSING_HELP.length).toBeGreaterThan(80);
  });
});

describe('server.ts wiring', () => {
  it('imports the preflight before anything that touches Prisma', async () => {
    // Import statements are HOISTED, so a bare assert() call placed between
    // imports in server.ts would NOT run first - the side effect has to be at
    // module scope inside preflight, and preflight has to be imported before
    // './app'. This was got wrong on the first attempt and the guard silently
    // never fired.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../../../src/server.ts'), 'utf8');

    const preflightAt = src.indexOf("'./config/preflight'");
    const appAt = src.indexOf("'./app'");
    const dbAt = src.indexOf("'./config/database'");

    expect(preflightAt, 'server.ts must import ./config/preflight').toBeGreaterThan(-1);
    expect(preflightAt).toBeLessThan(appAt);
    expect(preflightAt).toBeLessThan(dbAt);
  });

  it('runs the check at module scope, not as a hoisted-past call', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../../../src/config/preflight.ts'), 'utf8');
    // A module-scope invocation, i.e. not inside a function declaration.
    // It sits under a test-runner guard, so allow leading whitespace but
    // require it to be outside any `function`/`export` body.
    expect(src).toMatch(/^\s*assertPrismaClientGenerated\(\);$/m);
    // ...and it must be skipped under vitest, or importing this module in a
    // test would exit the runner.
    expect(src).toMatch(/VITEST/);
  });
});
