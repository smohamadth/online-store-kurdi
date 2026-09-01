/**
 * parsePagination — page/limit clamping for list endpoints.
 *
 * Regression: endpoints used `parseInt(req.query.limit) || N` raw, so
 * `?limit=999999999` scanned every row and `?limit=-5&page=2` produced a
 * negative Prisma skip (HTTP 500). The helper must coerce garbage to the
 * defaults and clamp the limit to a hard max.
 */
import { describe, it, expect } from 'vitest';
import { parsePagination, parseDays } from '../../../src/utils/pagination';

describe('parseDays', () => {
  it('returns the default when absent/empty/NaN/fractional/negative', () => {
    expect(parseDays(undefined)).toBe(30);
    expect(parseDays(null)).toBe(30);
    expect(parseDays('')).toBe(30);
    expect(parseDays('abc')).toBe(30);
    expect(parseDays('3.5')).toBe(30);
    expect(parseDays('-7')).toBe(30);
    expect(parseDays('0')).toBe(30);
    expect(parseDays('1e999')).toBe(30);
  });

  it('parses valid integers and clamps to the max', () => {
    expect(parseDays('7')).toBe(7);
    expect(parseDays('9999')).toBe(365); // clamped to maxDays
    expect(parseDays('1')).toBe(1);
  });

  it('respects custom default and max', () => {
    expect(parseDays(undefined, 14, 90)).toBe(14);
    expect(parseDays('100', 14, 90)).toBe(90);
  });
});

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
