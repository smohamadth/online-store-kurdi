/**
 * Pure arithmetic for the admin sales report.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 * -----------------------------------
 * The admin analytics page used to render a hardcoded trend on every KPI card
 * ("↑ 12% from last month", "↑ 8%", "↑ 5%") and a "Revenue Overview" chart
 * built from a literal array of twelve numbers. Those were decorative: a store
 * whose revenue had halved still displayed "↑ 12%". Reporting that invents
 * numbers is worse than reporting nothing, because it is trusted.
 *
 * Replacing them means doing real arithmetic on real rows, and that arithmetic
 * has genuinely tricky cases — division by zero when the previous period had
 * no sales, months with no orders that must still appear on the chart, and
 * timezone/DST drift when bucketing by month. Keeping it pure and free of
 * Prisma lets the tests cover those cases exhaustively without a database.
 *
 * Bucketing happens in JS rather than SQL (no date_trunc / strftime) because
 * the project runs SQLite-dialect migrations against Postgres in places; a
 * dialect-specific date function would work on one and fail on the other.
 */

/** A single time bucket of sales. */
export type RevenueBucket = {
  /** Bucket start, ISO date (YYYY-MM-DD). Stable across timezones. */
  date: string;
  /** Human label for the axis, e.g. "Jan" or "3 Feb". */
  label: string;
  revenue: number;
  orders: number;
};

/** Direction of a period-over-period change. */
export type TrendDirection = 'up' | 'down' | 'flat';

export type Delta = {
  current: number;
  previous: number;
  /** Absolute change, current - previous. */
  change: number;
  /**
   * Percentage change, rounded to one decimal. Null when the previous period
   * was zero: "infinite % growth" is not a meaningful thing to show a
   * merchant, so the UI must render "no prior data" instead of a number.
   */
  percent: number | null;
  direction: TrendDirection;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Round to 2dp, avoiding float dust like 0.1+0.2 => 0.30000000000000004. */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Compare two periods.
 *
 * The zero-previous case is the important one. A brand-new store, or any
 * store's first month, has previous === 0; dividing by it yields Infinity,
 * which serialises to null in JSON and renders as a blank or "NaN%" card.
 * We return percent: null explicitly so the UI can say something honest.
 */
export function computeDelta(current: number, previous: number): Delta {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const change = round2(cur - prev);

  let percent: number | null = null;
  if (prev > 0) {
    percent = Math.round((change / prev) * 1000) / 10;
  }

  let direction: TrendDirection = 'flat';
  if (change > 0) direction = 'up';
  else if (change < 0) direction = 'down';

  return { current: round2(cur), previous: round2(prev), change, percent, direction };
}

/** UTC YYYY-MM-DD. Used as the bucket key so buckets never shift with DST. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** UTC YYYY-MM. */
export function isoMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export type Granularity = 'day' | 'month';

/**
 * Choose bucket size for a span. Ninety-odd daily bars are unreadable on a
 * dashboard and unprintable on A4, so longer ranges roll up to months.
 */
export function pickGranularity(days: number): Granularity {
  return days > 92 ? 'month' : 'day';
}

type OrderLike = { createdAt: Date | string; totalAmount: number | null };

/**
 * Bucket orders into a dense, chronologically ordered series.
 *
 * "Dense" matters: months or days with no sales must still appear, at zero.
 * A sparse series silently omits the bad weeks, so a chart drawn from it
 * flatters the store — exactly the kind of quiet dishonesty this work is
 * removing.
 */
export function bucketRevenue(
  orders: OrderLike[],
  from: Date,
  to: Date,
  granularity: Granularity,
): RevenueBucket[] {
  const buckets = new Map<string, RevenueBucket>();

  // Seed every bucket in range first, so gaps are explicit zeros.
  if (granularity === 'month') {
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    while (cursor <= last) {
      const key = isoMonth(cursor);
      buckets.set(key, {
        date: `${key}-01`,
        label: `${MONTHS[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`,
        revenue: 0,
        orders: 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    while (cursor <= last) {
      const key = isoDay(cursor);
      buckets.set(key, {
        date: key,
        label: `${cursor.getUTCDate()} ${MONTHS[cursor.getUTCMonth()]}`,
        revenue: 0,
        orders: 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  for (const o of orders) {
    const when = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
    if (Number.isNaN(when.getTime())) continue;
    const key = granularity === 'month' ? isoMonth(when) : isoDay(when);
    const bucket = buckets.get(key);
    // Orders outside the seeded range are ignored rather than appended, so
    // an off-by-one in the caller's query can't bolt a stray bar onto a chart.
    if (!bucket) continue;
    bucket.revenue = round2(bucket.revenue + (Number(o.totalAmount) || 0));
    bucket.orders += 1;
  }

  return [...buckets.values()];
}

/**
 * Scale bucket revenue to 0..100 for bar heights.
 *
 * Returns zeros when every bucket is zero — without the guard the caller
 * divides by a zero max and renders NaN% tall bars, which collapse the chart.
 */
export function toBarHeights(buckets: RevenueBucket[]): number[] {
  const max = Math.max(0, ...buckets.map((b) => b.revenue));
  if (max <= 0) return buckets.map(() => 0);
  return buckets.map((b) => Math.round((b.revenue / max) * 100));
}
