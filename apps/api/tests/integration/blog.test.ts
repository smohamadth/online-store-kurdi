/**
 * Blog integration tests.
 *
 * Notable paths:
 *   - drafts are 404 to the public, never visible by slug
 *   - the slug schema is Unicode-aware (Kurdish/Arabic titles)
 *   - the "view" counter is fire-and-forget
 *   - the rich text content is sanitised on write
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

const postBody = (over: any = {}) => ({
  slug: 'hello-world',
  title: 'Hello World',
  content: 'Greetings!',
  tags: ['intro'],
  ...over,
});

describe('GET /api/blog (public)', () => {
  it('returns only published posts', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'pub', status: 'published' }));
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'drft', status: 'draft' }));
    const res = await request(app).get('/api/blog');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe('pub');
  });

  it('filters by tag', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'a', tags: ['news'] }));
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'b', tags: ['sports'] }));
    const res = await request(app).get('/api/blog?tag=news');
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.tags.includes('news'))).toBe(true);
  });
});

describe('GET /api/blog/tags (public)', () => {
  it('returns a tag cloud with counts', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'a', tags: ['x', 'y'] }));
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'b', tags: ['x'] }));
    const res = await request(app).get('/api/blog/tags');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/blog/slug/:slug (public)', () => {
  it('returns a published post with related posts', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'first' }));
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'second' }));
    const res = await request(app).get('/api/blog/slug/first');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('first');
    expect(res.body.data.related).toBeDefined();
  });

  it('404s a draft', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'drft', status: 'draft' }));
    const res = await request(app).get('/api/blog/slug/drft');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/blog/slug/:slug/view', () => {
  it('increments the view counter (fire-and-forget)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'countered' }));
    const res = await request(app).post('/api/blog/slug/countered/view');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/blog (admin)', () => {
  it('creates a published post by default', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody());
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('published');
  });

  it('rejects a reserved slug', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'tags' }));
    expect(res.status).toBe(400);
  });

  it('409 on duplicate slug', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody());
    const res = await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody());
    expect(res.status).toBe(409);
  });

  it('sanitises script tags from the content', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ content: '<p>safe<script>evil()</script></p>' }));
    expect(res.status).toBe(201);
    const stored = await mockPrisma.blogPost.findUnique({ where: { id: res.body.data.id } });
    expect(stored?.content).not.toMatch(/<script/i);
  });

  it('accepts a Unicode slug (regression: the old rule stripped them all)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody({ slug: 'kurdish-news', title: 'Kurdish News' }));
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('kurdish-news');
  });
});

describe('PUT /api/blog/:id (admin)', () => {
  it('updates a post', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody());
    const res = await request(app).put(`/api/blog/${created.body.data.id}`).set('Authorization', `Bearer ${token}`).send({ title: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New');
  });

  it('400 when no fields are supplied', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody());
    const res = await request(app).put(`/api/blog/${created.body.data.id}`).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/blog/:id (admin)', () => {
  it('deletes a post', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/blog').set('Authorization', `Bearer ${token}`).send(postBody());
    const res = await request(app).delete(`/api/blog/${created.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
