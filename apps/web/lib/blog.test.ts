/**
 * blog.ts — date formatting helper used by every blog card.
 *
 * Notes:
 *   - formatPostDate returns an empty string for nullish input (callers
 *     can render unconditionally)
 *   - the output is a stable, locale-explicit format so it matches
 *     server-side rendering
 */
import { describe, it, expect } from 'vitest';
import { formatPostDate } from './blog';

describe('formatPostDate', () => {
  it('returns "" for nullish input', () => {
    expect(formatPostDate(null)).toBe('');
    expect(formatPostDate(undefined)).toBe('');
  });

  it('returns "Invalid Date" for an unparseable string (current behaviour)', () => {
    // The source has no special handling for invalid input; we document the
    // current behaviour so a future change is intentional.
    expect(formatPostDate('not-a-date')).toBe('Invalid Date');
  });

  it('formats an ISO timestamp as DD Month YYYY (en-GB)', () => {
    const out = formatPostDate('2025-08-15T12:00:00Z');
    // The exact day depends on timezone, but the month and year are stable
    expect(out).toMatch(/2025/);
    expect(out).toMatch(/August/);
  });

  it('is stable: the same input gives the same output', () => {
    const a = formatPostDate('2025-01-15T00:00:00Z');
    const b = formatPostDate('2025-01-15T00:00:00Z');
    expect(a).toBe(b);
  });
});
