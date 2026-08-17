import fs from 'fs';
import path from 'path';

/**
 * Catch a DATABASE_URL that does not match the Prisma datasource provider.
 *
 * Prisma's own error names the symptom but not the cause or the fix:
 *
 *     Error validating datasource `db`: the URL must start with the
 *     protocol `file:`  (P1012)
 *
 * Nothing in that message tells you WHICH file is wrong or what to put in it.
 * The trap was ours: schema.prisma ships with provider = "sqlite", while both
 * .env.example files handed out a PostgreSQL URL and every setup doc says
 * `cp .env.example apps/api/.env`. Following the instructions produced a
 * broken install.
 *
 * The examples are fixed, but anyone with an older .env still has the bad
 * value, so this turns the mismatch into an instruction.
 */

/** Prefix each provider expects at the start of DATABASE_URL. */
const EXPECTED_PREFIXES: Record<string, string[]> = {
  sqlite: ['file:'],
  postgresql: ['postgres://', 'postgresql://'],
  mysql: ['mysql://'],
  sqlserver: ['sqlserver://'],
  mongodb: ['mongodb://', 'mongodb+srv://'],
  cockroachdb: ['postgres://', 'postgresql://'],
};

/** Read `provider` out of schema.prisma. Returns null if it can't be read. */
export function readSchemaProvider(schemaPath?: string): string | null {
  const file = schemaPath || path.join(process.cwd(), 'prisma', 'schema.prisma');
  try {
    const text = fs.readFileSync(file, 'utf8');
    // Only look inside the `datasource` block - `generator client` also has a
    // `provider` key, and matching that would give "prisma-client-js".
    const ds = text.match(/datasource\s+\w+\s*\{([\s\S]*?)\}/);
    if (!ds) return null;
    const m = ds[1].match(/provider\s*=\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export interface UrlMismatch {
  provider: string;
  expected: string[];
  actualScheme: string;
}

/**
 * Returns details of a mismatch, or null when things are consistent.
 *
 * Deliberately conservative: an unreadable schema, an unknown provider or an
 * empty URL all return null. Blocking startup on a case we don't understand
 * would be worse than the error we're trying to replace.
 */
export function findDatabaseUrlMismatch(
  url: string | undefined,
  provider: string | null
): UrlMismatch | null {
  if (!url || !provider) return null;

  const expected = EXPECTED_PREFIXES[provider];
  if (!expected) return null;

  if (expected.some((p) => url.startsWith(p))) return null;

  const actualScheme = url.includes('://')
    ? `${url.split('://')[0]}://`
    : url.split(':')[0] + ':';

  return { provider, expected, actualScheme };
}

/** The exact lines to print, formatted for a terminal. */
export function databaseUrlHelp(m: UrlMismatch): string[] {
  const wantSqlite = m.provider === 'sqlite';
  return [
    '❌ DATABASE_URL does not match your Prisma schema.',
    '',
    `   schema.prisma provider : ${m.provider}`,
    `   expected URL to start  : ${m.expected.join('  or  ')}`,
    `   your DATABASE_URL uses : ${m.actualScheme}`,
    '',
    '   Fix - edit apps/api/.env and set:',
    '',
    wantSqlite
      ? '     DATABASE_URL="file:./dev.db"'
      : `     DATABASE_URL=${m.expected[0]}USER:PASSWORD@localhost:5432/DBNAME`,
    '',
    wantSqlite
      ? '   (Or, to really use another database, change `provider` in'
      : '   (Or, to use SQLite instead, set provider = "sqlite" in',
    wantSqlite
      ? '    apps/api/prisma/schema.prisma and re-run `npx prisma migrate dev`.)'
      : '    apps/api/prisma/schema.prisma and set DATABASE_URL="file:./dev.db".)',
    '',
    '   Then start the API again.',
  ];
}
