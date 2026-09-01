/**
 * Storage (S3/MinIO) integration tests.
 *
 * The mock storage service always succeeds, so these tests assert that the
 * HTTP shape is correct and the routes return what the storefront expects.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('POST /api/storage/upload', () => {
  it('rejects an unauthenticated upload (401)', async () => {
    const res = await request(app)
      .post('/api/storage/upload')
      .attach('file', Buffer.from('hi'), 'test.txt');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/storage/presigned/:fileName', () => {
  it('returns a presigned URL for an admin', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/storage/presigned/test.txt')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('rejects a customer (403 — no presigning arbitrary objects)', async () => {
    // Regression: any authenticated user could mint a presigned URL for
    // ANY bucket object (bypassing the private-prefix gating). This
    // endpoint is an admin delivery tool.
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/storage/presigned/private/orders/secret.pdf')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('clamps a hostile expiry to the 7-day cap (no 500)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    for (const expiry of ['999999999', '0', '-5', 'abc']) {
      const res = await request(app)
        .get(`/api/storage/presigned/test.txt?expiry=${expiry}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.expiresIn).toBeGreaterThanOrEqual(60);
      expect(res.body.data.expiresIn).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    }
  });

  it('requires auth (401)', async () => {
    const res = await request(app).get('/api/storage/presigned/test.txt');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/storage/upload — folder allowlist', () => {
  it('rejects an unknown folder prefix (400)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/storage/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('folder', 'products/../public')
      .attach('file', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/storage/:fileName (admin)', () => {
  it('deletes a file', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .delete('/api/storage/test.txt')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
