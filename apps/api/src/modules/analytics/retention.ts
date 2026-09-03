/**
 * Analytics data retention sweep (I/O).
 *
 * The policy decisions live in retentionPolicy.ts, which is pure and
 * exhaustively unit-tested; this module is the database work around them.
 */
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import {
  resolveRetentionDays, retentionCutoff, isSafeCutoff,
} from './retentionPolicy';

export * from './retentionPolicy';

export type PurgeResult = {
  /** Retention window actually applied. */
  days: number;
  /** Events older than the cutoff that were removed. */
  deleted: number;
  /** True when the batch cap stopped the purge before it finished. */
  truncated: boolean;
  /** Reported instead of deleting when dryRun is set. */
  dryRun: boolean;
};

/**
 * Delete analytics events older than the retention window.
 *
 * Batched rather than one big deleteMany: a store that has never purged could
 * have millions of rows, and a single unbounded delete holds a long write
 * transaction that blocks live tracking writes. Each batch is bounded, and the
 * job reports when it stopped early so a backlog is drained over several runs
 * instead of one damaging one.
 */
export async function purgeOldEvents(opts: {
  days?: number;
  now?: Date;
  dryRun?: boolean;
  /** Max rows removed in one run. */
  limit?: number;
  /** Rows per delete statement. */
  batchSize?: number;
} = {}): Promise<PurgeResult> {
  const days = resolveRetentionDays(opts.days ?? process.env.ANALYTICS_RETENTION_DAYS);
  const now = opts.now ?? new Date();
  const dryRun = !!opts.dryRun;
  const limit = Math.max(1, opts.limit ?? 50_000);
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? 1_000, limit));

  const cutoff = retentionCutoff(days, now);

  // Refuse rather than risk deleting live data on a bad config.
  if (!isSafeCutoff(cutoff, now)) {
    logger.error(
      `[analytics-retention] refusing to purge: unsafe cutoff ${cutoff.toISOString()}`,
    );
    return { days, deleted: 0, truncated: false, dryRun };
  }

  const where = { timestamp: { lt: cutoff } };

  if (dryRun) {
    const count = await prisma.userEvent.count({ where });
    logger.info(
      `[analytics-retention] DRY RUN: ${count} events older than ${days}d ` +
      `(before ${cutoff.toISOString()}) would be deleted`,
    );
    return { days, deleted: Math.min(count, limit), truncated: count > limit, dryRun: true };
  }

  let deleted = 0;
  let truncated = false;

  // Loop until nothing is left or the cap is hit. Each iteration deletes at
  // most batchSize rows.
  for (;;) {
    if (deleted >= limit) {
      truncated = true;
      break;
    }

    const remaining = Math.min(batchSize, limit - deleted);
    const batch = await prisma.userEvent.findMany({
      where,
      select: { id: true },
      take: remaining,
    });
    if (batch.length === 0) break;

    const res = await prisma.userEvent.deleteMany({
      where: { id: { in: (batch as Array<{ id: string }>).map((r) => r.id) } },
    });
    const removed = Number((res as any)?.count ?? batch.length);
    deleted += removed;

    // Defensive: if a delete removes nothing the rows are already gone or
    // undeletable, and looping would spin forever.
    if (removed === 0) break;
  }

  logger.info(
    `[analytics-retention] deleted=${deleted} olderThan=${days}d` +
    `${truncated ? ' (batch cap reached; more remain)' : ''}`,
  );

  return { days, deleted, truncated, dryRun: false };
}
