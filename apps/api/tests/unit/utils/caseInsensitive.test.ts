/**
 * Provider-aware case-insensitive matching.
 *
 * SQLite's LIKE is ASCII case-insensitive; Postgres's is not. Moving the
 * deployment to Postgres therefore breaks search silently - "laptop" stops
 * finding "Laptop Pro", with no error. But `mode: 'insensitive'` cannot just
 * be added everywhere either: SQLite REJECTS it, which would break every
 * developer machine and the whole test suite.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  activeProvider, supportsInsensitiveMode,
  containsInsensitive, startsWithInsensitive,
} from '../../../src/utils/caseInsensitive';

const ORIGINAL = process.env.DATABASE_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL;
});

describe('activeProvider', () => {
  it.each([
    ['postgresql://u:p@h:5432/db', 'postgresql'],
    ['postgres://u:p@h/db', 'postgresql'],
    ['file:./dev.db', 'sqlite'],
    ['file:/app/apps/api/data/store.db', 'sqlite'],
    ['mysql://u:p@h/db', 'mysql'],
    ['mongodb+srv://h/db', 'mongodb'],
  ])('reads %j as %j', (url, expected) => {
    expect(activeProvider(url)).toBe(expected);
  });

  it('is case- and whitespace-tolerant', () => {
    expect(activeProvider('  POSTGRESQL://u@h/db ')).toBe('postgresql');
  });

  it.each([[undefined], [''], ['   '], ['nonsense']])(
    'defaults to sqlite for %j',
    (bad) => {
      // Conservative direction: omitting `mode` on Postgres is merely less
      // helpful, but sending it to SQLite is a hard query error.
      expect(activeProvider(bad as any)).toBe('sqlite');
    },
  );

  it('reads DATABASE_URL when no argument is given', () => {
    process.env.DATABASE_URL = 'postgresql://u@h/db';
    expect(activeProvider()).toBe('postgresql');
  });
});

describe('supportsInsensitiveMode', () => {
  it('is true for Postgres', () => {
    expect(supportsInsensitiveMode('postgresql')).toBe(true);
  });

  it('is false for SQLite', () => {
    // The whole reason this module exists.
    expect(supportsInsensitiveMode('sqlite')).toBe(false);
  });

  it('is false for MySQL', () => {
    // MySQL collations are usually case-insensitive already, and Prisma
    // rejects `mode` there too.
    expect(supportsInsensitiveMode('mysql')).toBe(false);
  });
});

describe('containsInsensitive', () => {
  it('adds mode on Postgres', () => {
    expect(containsInsensitive('laptop', 'postgresql'))
      .toEqual({ contains: 'laptop', mode: 'insensitive' });
  });

  it('omits mode on SQLite', () => {
    // Including it would make the query throw, not merely behave differently.
    expect(containsInsensitive('laptop', 'sqlite')).toEqual({ contains: 'laptop' });
    expect(containsInsensitive('laptop', 'sqlite')).not.toHaveProperty('mode');
  });

  it.each([[''], [null], [undefined]])(
    'returns undefined for %j rather than matching everything',
    (empty) => {
      expect(containsInsensitive(empty as any, 'postgresql')).toBeUndefined();
    },
  );

  it('preserves the needle exactly, including case and spaces', () => {
    expect(containsInsensitive('  Laptop Pro ', 'postgresql')!.contains)
      .toBe('  Laptop Pro ');
  });

  it('does not mangle a needle containing SQL wildcards', () => {
    // Prisma parameterises these; the helper must not "helpfully" escape them
    // and change what the caller asked for.
    expect(containsInsensitive('100%_off', 'postgresql')!.contains).toBe('100%_off');
  });

  it('follows DATABASE_URL when no provider is passed', () => {
    process.env.DATABASE_URL = 'postgresql://u@h/db';
    expect(containsInsensitive('x')).toHaveProperty('mode', 'insensitive');
    process.env.DATABASE_URL = 'file:./dev.db';
    expect(containsInsensitive('x')).not.toHaveProperty('mode');
  });
});

describe('startsWithInsensitive', () => {
  it('adds mode on Postgres', () => {
    expect(startsWithInsensitive('lap', 'postgresql'))
      .toEqual({ startsWith: 'lap', mode: 'insensitive' });
  });

  it('omits mode on SQLite', () => {
    expect(startsWithInsensitive('lap', 'sqlite')).toEqual({ startsWith: 'lap' });
  });

  it('returns undefined for an empty needle', () => {
    expect(startsWithInsensitive('', 'postgresql')).toBeUndefined();
  });
});

describe('the shape Prisma actually receives', () => {
  it('is spreadable into a where clause on either provider', () => {
    for (const provider of ['sqlite', 'postgresql']) {
      const filter = containsInsensitive('shoes', provider);
      const where = { name: filter };
      expect(where.name!.contains).toBe('shoes');
      // No stray keys that a connector might reject.
      const keys = Object.keys(where.name!).sort();
      expect(keys).toEqual(provider === 'postgresql' ? ['contains', 'mode'] : ['contains']);
    }
  });
});

describe('search paths use the provider-aware helper', () => {
  // Ratchet. `contains:` on a user-supplied search term behaves differently
  // on SQLite and PostgreSQL, so a raw one in a SEARCH path is a silent
  // behaviour change when the deployment switches provider. Annotate a
  // reviewed exception with `provider-ok: <reason>`.
  //
  // Scoped to search entry points rather than every `contains:` in the
  // codebase: exact-token lookups (a tag, an email already normalised to
  // lowercase) are unaffected by collation and rewriting them would be churn.
  const SEARCH_FILES = [
    'modules/products/productSearch.service.ts',
  ];

  it('no raw contains: in a search path', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const SRC = resolve(__dirname, '../../../src');

    const offenders: string[] = [];
    for (const rel of SEARCH_FILES) {
      const lines = readFileSync(resolve(SRC, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return;
        if (!/\bcontains:\s*\w/.test(line)) return;
        const context = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        if (/provider-ok/.test(context)) return;
        offenders.push(`${rel}:${i + 1}: ${t}`);
      });
    }

    expect(
      offenders,
      `use containsInsensitive() so PostgreSQL matches case-insensitively:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
