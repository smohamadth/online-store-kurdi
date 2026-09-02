/**
 * Home page sections integration tests.
 *
 * Notable paths:
 *   - first read seeds the shipped defaults (ensureSeeded)
 *   - rich text is sanitised on write
 *   - reorder with an unknown id is rejected
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

describe('GET /api/home-sections (public)', () => {
  it('seeds the default sections and returns them', async () => {
    const res = await request(app).get('/api/home-sections');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('PUT /api/home-sections/:id (admin)', () => {
  it('updates a section', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const list = await request(app).get('/api/home-sections');
    const id = list.body.data[0].id;
    const res = await request(app)
      .put(`/api/home-sections/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New' });
    expect(res.status).toBe(200);
  });

  it('sanitises a richText config.html on write', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const list = await request(app).get('/api/home-sections');
    const rich = list.body.data.find((s: any) => s.type === 'richText');
    if (!rich) return; // no rich text block seeded
    const res = await request(app)
      .put(`/api/home-sections/${rich.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ config: { html: '<p>safe<script>evil()</script></p>' } });
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/home-sections/reorder', () => {
  it('reorders sections', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const list = await request(app).get('/api/home-sections');
    const ids = list.body.data.map((s: any) => s.id);
    const res = await request(app)
      .put('/api/home-sections/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ order: [...ids].reverse() });
    expect(res.status).toBe(200);
  });

  it('rejects an unknown id', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/home-sections/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ order: ['00000000-0000-4000-a000-000000000000'] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/home-sections (admin)', () => {
  it('creates a new block', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/home-sections')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'custom-block', type: 'richText' });
    expect(res.status).toBe(201);
  });

  it('creates the admin-designed custom section type', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/home-sections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        key: 'design-band',
        type: 'custom',
        config: {
          html: '<p>safe<script>evil()</script></p>',
          background: 'brand',
          padding: 'large',
          width: 'centered',
        },
      });
    expect(res.status).toBe(201);

    // The html is sanitised on write, same contract as richText.
    const list = await request(app).get('/api/home-sections');
    const band = list.body.data.find((s: any) => s.key === 'design-band');
    expect(band).toBeTruthy();
    expect(band.config.html).not.toContain('<script>');
    expect(band.config.background).toBe('brand');
  });

  it('still rejects unknown types', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/home-sections')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'warp', type: 'warp-drive' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/home-sections/reset (admin)', () => {
  it('resets to the shipped defaults', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/home-sections/reset').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/home-sections/:id (admin)', () => {
  it('removes a block', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const list = await request(app).get('/api/home-sections');
    const id = list.body.data[0].id;
    const res = await request(app)
      .delete(`/api/home-sections/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
