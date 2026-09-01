/**
 * parsePagination — page/limit clamping for list endpoints.
 *
 * Regression: endpoints used `parseInt(req.query.limit) || N` raw, so
 * `?limit=999999999` scanned every row and `?limit=-5&page=2` produced a
 * negative Prisma skip (HTTP 500). The helper must coerce garbage to the
 * defaults and clamp the limit to a hard max.
 */
import { describe, it, expect } from 'vitest';
import { parsePagination } from '../../../src/utils/pagination';

describe('parsePagination', () => {
  it('uses defaults when params are absent', () => {
    expect(parsePagination(undefined)).toEqual({ page: 1, limit: 10, skip: 0 });
    expect(parsePagination({}, { limit: 25 })).toEqual({ page: 1, limit: 25, skip: 0 });
  });

  it('clamps the limit to the configured max', () => {
    expect(parsePagination({ limit: '999999999' })).toEqual({ page: 1, limit: 100, skip: 0 });
    expect(parsePagination({ limit: '50' }, { maxLimit: 20 })).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('coerces negative, fractional, NaN and non-string values', () => {
    expect(parsePagination({ limit: '-5', page: '2' }).limit).toBe(10);
    expect(parsePagination({ limit: '1.5' }).limit).toBe(10);
    expect(parsePagination({ limit: 'abc' }).limit).toBe(10);
    expect(parsePagination({ limit: '2', page: '-1' }).page).toBe(1);
    expect(parsePagination({ limit: '2', page: '0' }).page).toBe(1);
    expect(parsePagination({ limit: '2', page: 'NaN' }).page).toBe(1);
    expect(parsePagination({ limit: 2 as any }).limit).toBe(10);
  });

  it('computes skip from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20, skip: 40 });
  });
});
