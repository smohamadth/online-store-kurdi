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
  it('returns a presigned URL when authenticated', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/storage/presigned/test.txt')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('requires auth (401)', async () => {
    const res = await request(app).get('/api/storage/presigned/test.txt');
    expect(res.status).toBe(401);
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
