/**
 * Provider-aware case-insensitive matching for Prisma string filters.
 *
 * The two databases this project supports disagree about `contains`:
 *
 *   SQLite    LIKE is ASCII case-INSENSITIVE by default, so
 *             { name: { contains: 'laptop' } } matches "Laptop Pro".
 *   Postgres  LIKE is case-SENSITIVE, so the same filter matches nothing.
 *             Case-insensitive matching needs ILIKE, which Prisma emits for
 *             `mode: 'insensitive'`.
 *
 * That difference is silent and user-visible: after moving the deployment to
 * PostgreSQL a shopper searching "laptop" would stop finding "Laptop Pro",
 * with no error anywhere. Twenty call sites across product search, filtering,
 * blog search and admin lookups are affected.
 *
 * `mode` cannot simply be added everywhere: the SQLite provider REJECTS it at
 * query time, which would break development and the whole test suite. So the
 * flag is emitted only when the active provider supports it.
 */

/** Providers whose Prisma connector supports `mode: 'insensitive'`. */
const SUPPORTS_MODE = new Set(['postgresql', 'postgres', 'cockroachdb', 'mongodb']);

/**
 * Which provider the running client was generated for.
 *
 * Read from DATABASE_URL rather than schema.prisma: the schema file is chosen
 * at container start (see scripts/entrypoint-api.sh), so the URL is the one
 * source that is always correct at runtime. Defaults to SQLite - the
 * conservative direction, since omitting `mode` is merely less helpful on
 * Postgres, while sending it to SQLite is a hard query error.
 */
export function activeProvider(url: string | undefined = process.env.DATABASE_URL): string {
  const u = String(url ?? '').trim().toLowerCase();
  if (u.startsWith('postgres://') || u.startsWith('postgresql://')) return 'postgresql';
  if (u.startsWith('mysql://')) return 'mysql';
  if (u.startsWith('mongodb://') || u.startsWith('mongodb+srv://')) return 'mongodb';
  if (u.startsWith('sqlserver://')) return 'sqlserver';
  return 'sqlite';
}

export function supportsInsensitiveMode(
  provider: string = activeProvider(),
): boolean {
  return SUPPORTS_MODE.has(provider);
}

/**
 * Build a `contains` filter that is case-insensitive on every provider.
 *
 *   where: { name: containsInsensitive(q) }
 *
 * On Postgres this adds `mode: 'insensitive'` (ILIKE). On SQLite it returns a
 * plain `contains`, which is already case-insensitive for ASCII.
 *
 * Returns undefined for an empty needle so callers can spread it without
 * accidentally matching everything.
 */
export function containsInsensitive(
  value: string | null | undefined,
  provider: string = activeProvider(),
): { contains: string; mode?: 'insensitive' } | undefined {
  const v = String(value ?? '');
  if (!v) return undefined;
  return supportsInsensitiveMode(provider)
    ? { contains: v, mode: 'insensitive' }
    : { contains: v };
}

/** As containsInsensitive, for prefix matches. */
export function startsWithInsensitive(
  value: string | null | undefined,
  provider: string = activeProvider(),
): { startsWith: string; mode?: 'insensitive' } | undefined {
  const v = String(value ?? '');
  if (!v) return undefined;
  return supportsInsensitiveMode(provider)
    ? { startsWith: v, mode: 'insensitive' }
    : { startsWith: v };
}
