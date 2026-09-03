/**
 * Analytics retention, end to end.
 *
 * UserEvent rows carry session ids, user agents and IPs for identifiable
 * customers, and nothing ever deleted them. These drive the real purge and
 * assert on what survives - the important property is that it removes ONLY
 * what is past the window.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { purgeOldEvents } from '../../src/modules/analytics/retention';
import { DEFAULT_RETENTION_DAYS } from '../../src/modules/analytics/retentionPolicy';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

async function event(daysOld: number, eventType = 'view') {
  return mockPrisma.userEvent.create({
    data: {
      sessionId: `s-${Math.random()}`,
      eventType,
      metadata: '{}',
      timestamp: daysAgo(daysOld),
    },
  });
}

describe('purgeOldEvents', () => {
  it('deletes events older than the window and keeps the rest', async () => {
    await event(400);
    await event(300);
    const keep = await event(10);

    const res = await purgeOldEvents({ days: 180 });
    expect(res.deleted).toBe(2);

    const left = await mockPrisma.userEvent.findMany({});
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(keep.id);
  });

  it('keeps an event exactly at the boundary', async () => {
    // Off-by-one here silently destroys a day of reporting every run.
    await event(179.9);
    const res = await purgeOldEvents({ days: 180 });
    expect(res.deleted).toBe(0);
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(1);
  });

  it('deletes an event just past the boundary', async () => {
    await event(180.1);
    expect((await purgeOldEvents({ days: 180 })).deleted).toBe(1);
  });

  it('does nothing on an empty table', async () => {
    const res = await purgeOldEvents({ days: 180 });
    expect(res.deleted).toBe(0);
    expect(res.truncated).toBe(false);
  });

  it('is a no-op when everything is recent', async () => {
    for (let i = 0; i < 5; i++) await event(i);
    expect((await purgeOldEvents({ days: 180 })).deleted).toBe(0);
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(5);
  });

  it('reports the window it actually applied', async () => {
    // A caller passing a nonsense window must see what was really used, not
    // what they asked for.
    const res = await purgeOldEvents({ days: 0 });
    expect(res.days).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('a bad window does not delete recent data', async () => {
    // The floor exists so a typo of 0 cannot wipe live reporting.
    await event(1);
    await event(5);
    const res = await purgeOldEvents({ days: 0 });
    expect(res.deleted).toBe(0);
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(2);
  });

  it('a negative window is treated as a typo, not as "delete all"', async () => {
    await event(1);
    await purgeOldEvents({ days: -30 });
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(1);
  });
});

describe('dry run', () => {
  it('reports the count without deleting anything', async () => {
    await event(400);
    await event(300);

    const res = await purgeOldEvents({ days: 180, dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.deleted).toBe(2);
    // Nothing actually removed.
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(2);
  });

  it('a real run afterwards still deletes them', async () => {
    await event(400);
    await purgeOldEvents({ days: 180, dryRun: true });
    expect((await purgeOldEvents({ days: 180 })).deleted).toBe(1);
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(0);
  });
});

describe('batching', () => {
  it('respects the run cap and reports truncation', async () => {
    // A store that has never purged could have millions of rows; one
    // unbounded delete would hold a long write transaction and block live
    // tracking.
    for (let i = 0; i < 10; i++) await event(400);

    const res = await purgeOldEvents({ days: 180, limit: 4, batchSize: 2 });
    expect(res.deleted).toBe(4);
    expect(res.truncated).toBe(true);
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(6);
  });

  it('drains the backlog over repeated runs', async () => {
    for (let i = 0; i < 10; i++) await event(400);

    let guard = 0;
    for (;;) {
      const res = await purgeOldEvents({ days: 180, limit: 4, batchSize: 2 });
      if (res.deleted === 0 || ++guard > 10) break;
    }
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(0);
  });

  it('does not report truncation when the backlog fits', async () => {
    for (let i = 0; i < 3; i++) await event(400);
    const res = await purgeOldEvents({ days: 180, limit: 100 });
    expect(res.deleted).toBe(3);
    expect(res.truncated).toBe(false);
  });
});

describe('POST /api/analytics/retention/purge', () => {
  it('requires an admin', async () => {
    const { token } = await authHeader();
    await request(app)
      .post('/api/analytics/retention/purge')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects an anonymous caller', async () => {
    await request(app).post('/api/analytics/retention/purge').expect(401);
  });

  it('supports a dry run for an admin', async () => {
    await event(400);
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/analytics/retention/purge')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ dryRun: true, days: 180 });

    expect(res.status).toBe(200);
    expect(res.body.data.dryRun).toBe(true);
    expect(res.body.data.deleted).toBe(1);
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(1);
  });

  it('purges for real when asked', async () => {
    await event(400);
    await event(1);
    const admin = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/analytics/retention/purge')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ days: 180 });

    expect(res.body.data.deleted).toBe(1);
    expect(await mockPrisma.userEvent.findMany({})).toHaveLength(1);
  });
});
