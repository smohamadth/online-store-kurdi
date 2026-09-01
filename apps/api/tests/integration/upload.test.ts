/**
 * Upload security tests.
 *
 * The `folder` body parameter and the DELETE path components land in
 * filesystem paths (uploads/<folder>/<id>/...), so they are validated at
 * the route (clean 400) AND inside storage.service (defence in depth).
 * These tests pin that a hostile folder/id can never reach the disk.
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

// 1x1 transparent PNG (sharp re-encodes it; the buffer just needs to be a
// real image so the happy path exercises the full pipeline).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('POST /api/upload/image', () => {
  it('rejects unauthenticated uploads (401)', async () => {
    const res = await request(app)
      .post('/api/upload/image')
      .attach('file', TINY_PNG, 'x.png');
    expect(res.status).toBe(401);
  });

  it('rejects a path-traversal folder (400) before touching the disk', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${token}`)
      .field('folder', '../../../etc')
      .attach('file', TINY_PNG, 'x.png');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid upload folder/);
  });

  it('rejects an unknown folder name (400)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${token}`)
      .field('folder', 'not-a-bucket')
      .attach('file', TINY_PNG, 'x.png');
    expect(res.status).toBe(400);
  });

  it('accepts a real image into an allowed folder', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${token}`)
      .field('folder', 'products')
      .attach('file', TINY_PNG, 'x.png');
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^\/uploads\/products\/[0-9a-f-]+\/original\.jpg$/);
    expect(res.body.data.variants.length).toBeGreaterThan(0);
  });
});

describe('DELETE /api/upload/:folder/:id', () => {
  it('rejects a traversal folder in the URL (400)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    // %2e%2e decodes to ".." — must be refused before path.join.
    const res = await request(app)
      .delete('/api/upload/%2e%2e%2f%2e%2e%2fetc/some-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('rejects a traversal id in the URL (400)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .delete('/api/upload/products/%2e%2e%2f%2e%2e%2fetc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('requires admin (403 for customers)', async () => {
    const { token } = await authHeader(); // role customer
    const res = await request(app)
      .delete('/api/upload/products/anything')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
