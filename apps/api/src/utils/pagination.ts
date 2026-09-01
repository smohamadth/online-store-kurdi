// ---------------------------------------------------------------------------
// Pagination + time-window parsing (shared).
//
// List endpoints used to do `parseInt(req.query.limit) || N` with no upper
// bound, so `?limit=999999999` asked the DB for every row and `?limit=-5`
// produced a negative `skip` (Prisma 500). This helper clamps both page and
// limit to sane ranges and coerces garbage to the defaults.
// ---------------------------------------------------------------------------

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Parse a "days" window parameter (analytics ranges, dashboards).
 * Non-positive, fractional or NaN inputs fall back to the default and the
 * result is clamped to [1, maxDays] — a hostile `?days=-999999` or
 * `?days=abc` can never produce a future-start range or an Invalid Date
 * (Prisma 500 on `gte: Invalid Date`).
 */
export function parseDays(
  value: unknown,
  defaultDays = 30,
  maxDays = 365
): number {
  if (value === undefined || value === null || value === '') return defaultDays;
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return defaultDays;
  return Math.min(n, maxDays);
}

/**
 * Parse `page`/`limit` from a query object with hard bounds.
 *
 * - page: integer >= 1 (default 1)
 * - limit: integer >= 1, capped at `maxLimit` (default 100)
 * - NaN, negative, fractional and non-string values fall back to the
 *   defaults — a hostile query string can never produce a 500 or a
 *   full-table scan.
 */
export function parsePagination(
  query: Record<string, unknown> | undefined,
  defaults: { page?: number; limit?: number; maxLimit?: number } = {}
): Pagination {
  const rawPage = query?.page;
  const rawLimit = query?.limit;

  const pageNum = typeof rawPage === 'string' ? Number(rawPage) : NaN;
  const page =
    Number.isFinite(pageNum) && pageNum >= 1 && Number.isInteger(pageNum)
      ? pageNum
      : (defaults.page ?? 1);

  const maxLimit = defaults.maxLimit ?? 100;
  const limitNum = typeof rawLimit === 'string' ? Number(rawLimit) : NaN;
  const limit =
    Number.isFinite(limitNum) && limitNum >= 1 && Number.isInteger(limitNum)
      ? Math.min(limitNum, maxLimit)
      : Math.min(defaults.limit ?? 10, maxLimit);

  return { page, limit, skip: (page - 1) * limit };
}
