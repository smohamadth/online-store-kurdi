/**
 * verifyDatabaseUrl — turns a Prisma P1012 (URL vs schema provider mismatch)
 * into an actionable message.
 *
 * The bug it fixes is genuinely opaque: Prisma's own error names the
 * symptom but not the cause, so the test file is the contract for the
 * human-readable message we generate.
 */
import { describe, it, expect } from 'vitest';
import {
  readSchemaProvider,
  findDatabaseUrlMismatch,
  databaseUrlHelp,
} from '../../../src/config/verifyDatabaseUrl';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('readSchemaProvider', () => {
  it('reads the provider out of the datasource block', () => {
    const tmp = path.join(os.tmpdir(), `schema-${Date.now()}.prisma`);
    fs.writeFileSync(
      tmp,
      `generator client { provider = "prisma-client-js" }
       datasource db { provider = "sqlite" url = env("DATABASE_URL") }`,
    );
    try {
      expect(readSchemaProvider(tmp)).toBe('sqlite');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('returns null when the file is unreadable', () => {
    expect(readSchemaProvider('/nope/does/not/exist.prisma')).toBe(null);
  });

  it('returns null when there is no datasource block', () => {
    const tmp = path.join(os.tmpdir(), `bad-${Date.now()}.prisma`);
    fs.writeFileSync(tmp, `generator client { provider = "prisma-client-js" }`);
    try {
      expect(readSchemaProvider(tmp)).toBe(null);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

describe('findDatabaseUrlMismatch', () => {
  it('returns null when url + provider agree (sqlite + file:)', () => {
    expect(findDatabaseUrlMismatch('file:./dev.db', 'sqlite')).toBe(null);
  });
  it('returns null when url + provider agree (postgres + postgres://)', () => {
    expect(findDatabaseUrlMismatch('postgres://x', 'postgresql')).toBe(null);
  });
  it('flags a postgres URL with a sqlite provider', () => {
    const m = findDatabaseUrlMismatch('postgres://localhost/x', 'sqlite');
    expect(m).not.toBe(null);
    expect(m!.provider).toBe('sqlite');
    expect(m!.expected).toEqual(['file:']);
  });
  it('flags a file: URL with a postgres provider', () => {
    const m = findDatabaseUrlMismatch('file:./dev.db', 'postgresql');
    expect(m).not.toBe(null);
    expect(m!.provider).toBe('postgresql');
    expect(m!.expected).toEqual(['postgres://', 'postgresql://']);
    expect(m!.actualScheme).toBe('file:');
  });
  it('returns null for an empty url (no false positive)', () => {
    expect(findDatabaseUrlMismatch(undefined, 'sqlite')).toBe(null);
    expect(findDatabaseUrlMismatch('', 'sqlite')).toBe(null);
  });
  it('returns null for an unknown provider (do not block startup)', () => {
    expect(findDatabaseUrlMismatch('postgres://x', 'unknown-db')).toBe(null);
  });
  it('records the offending scheme for the user', () => {
    const m = findDatabaseUrlMismatch('mysql://x', 'sqlite');
    expect(m!.actualScheme).toBe('mysql://');
  });
});

describe('databaseUrlHelp', () => {
  it('produces multi-line instructions mentioning the right fix for sqlite', () => {
    const lines = databaseUrlHelp({
      provider: 'sqlite',
      expected: ['file:'],
      actualScheme: 'postgresql://',
    });
    const text = lines.join('\n');
    expect(text).toMatch(/DATABASE_URL/);
    expect(text).toMatch(/sqlite/);
    expect(text).toMatch(/file:\.\/dev\.db/);
  });
  it('produces a postgres-shaped fix when provider is postgresql', () => {
    const lines = databaseUrlHelp({
      provider: 'postgresql',
      expected: ['postgres://', 'postgresql://'],
      actualScheme: 'file:',
    });
    expect(lines.join('\n')).toMatch(/USER:PASSWORD/);
  });
});
