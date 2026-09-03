/**
 * Analytics retention policy.
 *
 * This code deletes customer data permanently. The failure modes are
 * asymmetric: keeping too much is a compliance problem, but deleting too much
 * is unrecoverable - so the guards against a bad window matter more than the
 * happy path.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveRetentionDays, retentionCutoff, isSafeCutoff,
  DEFAULT_RETENTION_DAYS, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS,
} from '../../../src/modules/analytics/retentionPolicy';

const NOW = new Date('2026-06-01T12:00:00Z');

describe('resolveRetentionDays', () => {
  it('accepts a sensible window', () => {
    expect(resolveRetentionDays(90)).toBe(90);
    expect(resolveRetentionDays('365')).toBe(365);
  });

  it('defaults when unset', () => {
    expect(resolveRetentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays(null)).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays('')).toBe(DEFAULT_RETENTION_DAYS);
  });

  it.each([['abc'], [{}], [[]], [NaN], ['12abc']])(
    'falls back to the default for junk input %j',
    (bad) => {
      expect(resolveRetentionDays(bad)).toBe(DEFAULT_RETENTION_DAYS);
    },
  );

  it('refuses a window below the floor rather than honouring it', () => {
    // A typo of 0 or 1 must not wipe last week's reporting. Falling back to
    // the default is the safe direction: it keeps MORE data, not less.
    expect(resolveRetentionDays(0)).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays(1)).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays(MIN_RETENTION_DAYS - 1)).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('accepts exactly the floor', () => {
    expect(resolveRetentionDays(MIN_RETENTION_DAYS)).toBe(MIN_RETENTION_DAYS);
  });

  it('treats a negative window as a typo, never as "delete everything"', () => {
    expect(resolveRetentionDays(-30)).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('clamps an absurdly long window to the ceiling', () => {
    expect(resolveRetentionDays(999_999)).toBe(MAX_RETENTION_DAYS);
  });

  it('floors a fractional window', () => {
    expect(resolveRetentionDays(90.9)).toBe(90);
  });
});

describe('retentionCutoff', () => {
  it('is the window measured back from now', () => {
    const c = retentionCutoff(30, NOW);
    expect(c.toISOString()).toBe('2026-05-02T12:00:00.000Z');
  });

  it('a longer window reaches further back', () => {
    expect(retentionCutoff(365, NOW).getTime())
      .toBeLessThan(retentionCutoff(30, NOW).getTime());
  });

  it('is always in the past for any valid window', () => {
    for (const d of [MIN_RETENTION_DAYS, 30, 180, MAX_RETENTION_DAYS]) {
      expect(retentionCutoff(d, NOW).getTime()).toBeLessThan(NOW.getTime());
    }
  });
});

describe('isSafeCutoff', () => {
  it('accepts a cutoff in the past', () => {
    expect(isSafeCutoff(retentionCutoff(30, NOW), NOW)).toBe(true);
  });

  it('rejects a cutoff in the future', () => {
    // A future cutoff means "every row is older than this" - i.e. delete the
    // entire table.
    const future = new Date(NOW.getTime() + 60_000);
    expect(isSafeCutoff(future, NOW)).toBe(false);
  });

  it('rejects a cutoff of exactly now', () => {
    expect(isSafeCutoff(new Date(NOW.getTime()), NOW)).toBe(false);
  });

  it('rejects an invalid date rather than coercing it', () => {
    expect(isSafeCutoff(new Date('nonsense'), NOW)).toBe(false);
  });

  it.each([[null], [undefined], ['2026-01-01'], [0]])('rejects non-Date %j', (bad) => {
    expect(isSafeCutoff(bad as any, NOW)).toBe(false);
  });

  it('a zero-day window would be unsafe, which is why the floor exists', () => {
    // Belt and braces: even if resolveRetentionDays were bypassed, the cutoff
    // check refuses.
    expect(isSafeCutoff(retentionCutoff(0, NOW), NOW)).toBe(false);
  });
});
