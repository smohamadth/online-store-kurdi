import { describe, it, expect } from 'vitest';
import {
  computeDelta,
  bucketRevenue,
  pickGranularity,
  toBarHeights,
  round2,
  isoDay,
  isoMonth,
} from '../../../src/modules/analytics/report.helpers';

describe('computeDelta', () => {
  it('computes a rise', () => {
    const d = computeDelta(150, 100);
    expect(d.change).toBe(50);
    expect(d.percent).toBe(50);
    expect(d.direction).toBe('up');
  });

  it('computes a fall', () => {
    const d = computeDelta(50, 100);
    expect(d.change).toBe(-50);
    expect(d.percent).toBe(-50);
    expect(d.direction).toBe('down');
  });

  it('reports flat when nothing changed', () => {
    const d = computeDelta(100, 100);
    expect(d.change).toBe(0);
    expect(d.percent).toBe(0);
    expect(d.direction).toBe('flat');
  });

  // The case that made the old hardcoded "↑ 12%" indefensible: a new store.
  it('returns percent null when the previous period was zero', () => {
    const d = computeDelta(500, 0);
    expect(d.percent).toBeNull();
    expect(d.direction).toBe('up');
    expect(d.change).toBe(500);
  });

  it('returns percent null (not NaN) when both periods are zero', () => {
    const d = computeDelta(0, 0);
    expect(d.percent).toBeNull();
    expect(d.direction).toBe('flat');
  });

  it('never yields Infinity or NaN, which serialise to null in JSON', () => {
    for (const [cur, prev] of [[1, 0], [0, 0], [-5, 0], [0, 10]]) {
      const d = computeDelta(cur, prev);
      expect(Number.isFinite(d.change)).toBe(true);
      expect(d.percent === null || Number.isFinite(d.percent)).toBe(true);
    }
  });

  it('rounds percent to one decimal', () => {
    expect(computeDelta(1234, 1000).percent).toBe(23.4);
  });

  it('coerces null/undefined amounts to zero', () => {
    const d = computeDelta(undefined as any, null as any);
    expect(d.current).toBe(0);
    expect(d.previous).toBe(0);
  });
});

describe('round2', () => {
  it('kills float dust', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('pickGranularity', () => {
  it('uses days for short ranges and months for long ones', () => {
    expect(pickGranularity(7)).toBe('day');
    expect(pickGranularity(92)).toBe('day');
    expect(pickGranularity(93)).toBe('month');
    expect(pickGranularity(365)).toBe('month');
  });
});

describe('bucketRevenue', () => {
  const from = new Date('2024-01-01T00:00:00Z');
  const to = new Date('2024-03-31T23:59:59Z');

  it('emits a dense monthly series including months with no sales', () => {
    const buckets = bucketRevenue(
      [
        { createdAt: new Date('2024-01-15T10:00:00Z'), totalAmount: 100 },
        { createdAt: new Date('2024-03-02T10:00:00Z'), totalAmount: 50 },
      ],
      from, to, 'month',
    );
    expect(buckets.map((b) => b.date)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
    // February had no orders and must still be present, at zero.
    expect(buckets[1].revenue).toBe(0);
    expect(buckets[1].orders).toBe(0);
    expect(buckets[0].revenue).toBe(100);
    expect(buckets[2].revenue).toBe(50);
  });

  it('sums several orders into one bucket and counts them', () => {
    const buckets = bucketRevenue(
      [
        { createdAt: new Date('2024-01-05T10:00:00Z'), totalAmount: 10.1 },
        { createdAt: new Date('2024-01-06T10:00:00Z'), totalAmount: 20.2 },
      ],
      from, to, 'month',
    );
    expect(buckets[0].revenue).toBe(30.3);
    expect(buckets[0].orders).toBe(2);
  });

  it('buckets by day over a short range', () => {
    const buckets = bucketRevenue(
      [{ createdAt: new Date('2024-01-02T23:30:00Z'), totalAmount: 5 }],
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-03T00:00:00Z'),
      'day',
    );
    expect(buckets.map((b) => b.date)).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
    expect(buckets[1].revenue).toBe(5);
  });

  it('ignores orders outside the seeded range instead of appending them', () => {
    const buckets = bucketRevenue(
      [{ createdAt: new Date('2023-12-31T10:00:00Z'), totalAmount: 999 }],
      from, to, 'month',
    );
    expect(buckets).toHaveLength(3);
    expect(buckets.reduce((s, b) => s + b.revenue, 0)).toBe(0);
  });

  it('tolerates string dates and null amounts', () => {
    const buckets = bucketRevenue(
      [
        { createdAt: '2024-01-15T10:00:00Z', totalAmount: null },
        { createdAt: 'not-a-date', totalAmount: 10 },
      ],
      from, to, 'month',
    );
    expect(buckets[0].revenue).toBe(0);
    expect(buckets[0].orders).toBe(1); // the valid-date/null-amount one
  });

  it('spans a year boundary', () => {
    const buckets = bucketRevenue(
      [],
      new Date('2023-11-01T00:00:00Z'),
      new Date('2024-02-01T00:00:00Z'),
      'month',
    );
    expect(buckets.map((b) => b.date)).toEqual(
      ['2023-11-01', '2023-12-01', '2024-01-01', '2024-02-01']);
  });

  it('labels months with a two-digit year', () => {
    const buckets = bucketRevenue([], from, new Date('2024-01-31T00:00:00Z'), 'month');
    expect(buckets[0].label).toBe('Jan 24');
  });
});

describe('toBarHeights', () => {
  it('scales the tallest bar to 100', () => {
    const heights = toBarHeights([
      { date: 'a', label: 'a', revenue: 50, orders: 1 },
      { date: 'b', label: 'b', revenue: 100, orders: 1 },
    ]);
    expect(heights).toEqual([50, 100]);
  });

  // Without the guard this divides by zero and every bar is NaN% tall.
  it('returns zeros when there is no revenue at all', () => {
    const heights = toBarHeights([
      { date: 'a', label: 'a', revenue: 0, orders: 0 },
      { date: 'b', label: 'b', revenue: 0, orders: 0 },
    ]);
    expect(heights).toEqual([0, 0]);
    expect(heights.every(Number.isFinite)).toBe(true);
  });

  it('handles an empty series', () => {
    expect(toBarHeights([])).toEqual([]);
  });
});

describe('date keys', () => {
  it('are UTC so buckets do not drift with the server timezone', () => {
    expect(isoDay(new Date('2024-01-15T23:59:00Z'))).toBe('2024-01-15');
    expect(isoMonth(new Date('2024-01-15T23:59:00Z'))).toBe('2024-01');
  });
});
