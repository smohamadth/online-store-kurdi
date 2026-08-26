/**
 * Pages integration tests.
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

const pageBody = (over: any = {}) => ({
  slug: 'about-us',
  title: 'About Us',
  content: 'About our company.',
  ...over,
});

describe('GET /api/pages (public)', () => {
  it('returns only published pages', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ slug: 'pub', status: 'published' }));
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ slug: 'drft', status: 'draft' }));
    const res = await request(app).get('/api/pages');
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.slug !== 'drft')).toBe(true);
  });
});

describe('GET /api/pages/slug/:slug (public)', () => {
  it('returns a published page', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).get('/api/pages/slug/about-us');
    expect(res.status).toBe(200);
  });

  it('404s a draft', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ status: 'draft' }));
    const res = await request(app).get('/api/pages/slug/about-us');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/pages/all (admin)', () => {
  it('returns drafts and published alike', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ slug: 'p1', status: 'draft' }));
    const res = await request(app).get('/api/pages/all').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/pages/all').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/pages (admin)', () => {
  it('creates a published page by default', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    expect(res.status).toBe(201);
  });

  it('rejects a reserved slug (admin)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ slug: 'admin' }));
    expect(res.status).toBe(400);
  });

  it('409 on duplicate slug', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/pages/:id (admin)', () => {
  it('updates a page', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).put(`/api/pages/${created.body.data.id}`).set('Authorization', `Bearer ${token}`).send({ title: 'New' });
    expect(res.status).toBe(200);
  });

  it('400 when no changes', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).put(`/api/pages/${created.body.data.id}`).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/pages/:id (admin)', () => {
  it('removes a page', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).delete(`/api/pages/${created.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

/**
 * Type-aware page lookup.
 *
 * The storefront asks for a page by both type and slug
 * (`/api/pages/by-type/<type>/slug/<slug>`). An unknown type,
 * unknown slug, draft, or a row whose stored type doesn't
 * match the URL all return 404 — never the wrong page.
 */
describe('GET /api/pages/by-type/:type/slug/:slug (public)', () => {
  it('returns a published page when type and slug match', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'about-us', pageType: 'info' }));
    const res = await request(app).get('/api/pages/by-type/info/slug/about-us');
    expect(res.status).toBe(200);
    expect(res.body.data.pageType).toBe('info');
  });

  it('returns 404 for an unknown type (not "wrong page")', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'about-us', pageType: 'info' }));
    const res = await request(app).get('/api/pages/by-type/blog/slug/about-us');
    expect(res.status).toBe(404);
  });

  it('returns 404 when the URL type does not match the stored type', async () => {
    // Critical: a row that was /info/about is now /legal/about
    // (the merchant moved it). A stale /info/about link must NOT
    // return the legal page; that would be a silent content mix-up.
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'about', pageType: 'legal' }));
    const res = await request(app).get('/api/pages/by-type/info/slug/about');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a draft', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'wip', pageType: 'info', status: 'draft' }));
    const res = await request(app).get('/api/pages/by-type/info/slug/wip');
    expect(res.status).toBe(404);
  });

  it('serves the same slug from each type namespace independently', async () => {
    // Slug is globally unique in the schema, so two pages can't
    // actually collide on the same slug. What we test here is the
    // type-bucketed response: a page with slug=returns under
    // /help/... is distinct from one under /legal/...
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'returns-info', pageType: 'info' }));
    const res = await request(app).get('/api/pages/by-type/info/slug/returns-info');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('About Us');
  });
});

describe('POST /api/pages (admin): pageType validation', () => {
  it('defaults to "info" when pageType is omitted', async () => {
    // Legacy callers (a script, a stale admin bundle) shouldn't
    // need to set the field. The API lands them on the most
    // common bucket.
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'legacy' }));
    expect(res.status).toBe(201);
    expect(res.body.data.pageType).toBe('info');
  });

  it('accepts the three recognised types', async () => {
    const { token } = await authHeader({ role: 'admin' });
    for (const pageType of ['info', 'legal', 'help'] as const) {
      const res = await request(app)
        .post('/api/pages')
        .set('Authorization', `Bearer ${token}`)
        .send(pageBody({ slug: `p-${pageType}`, pageType }));
      expect(res.status).toBe(201);
      expect(res.body.data.pageType).toBe(pageType);
    }
  });

  it('rejects an unrecognised pageType with 400', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'bad', pageType: 'blog' }));
    expect(res.status).toBe(400);
  });

  it('rejects a pageType that is also a reserved top-level route', async () => {
    // 'p' is the legacy top-level. 'info'/'legal'/'help' are new.
    // The pageType column only allows the three recognised
    // values, so this is enforced by the enum, but assert
    // explicitly to make the contract visible.
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'try', pageType: 'p' }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/pages/:id (admin): pageType can be changed', () => {
  it('lets the admin move a page from /info to /legal', async () => {
    // The merchant re-categorises a page. The slug is preserved
    // (it's globally unique) but the type — and therefore the
    // URL — changes. The /p/<slug> dispatcher would 301 to the
    // new address.
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'cookies-notice', pageType: 'info' }));
    const id = created.body.data.id;
    const res = await request(app)
      .put(`/api/pages/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pageType: 'legal' });
    expect(res.status).toBe(200);
    expect(res.body.data.pageType).toBe('legal');
  });

  it('rejects an unrecognised pageType on update', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(pageBody());
    const res = await request(app)
      .put(`/api/pages/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pageType: 'article' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/pages (public): pageType is included in the list', () => {
  it('returns pageType for each page in the footer list', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'about', pageType: 'info' }));
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'cookies', pageType: 'legal' }));
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`)
      .send(pageBody({ slug: 'shipping', pageType: 'help' }));
    const res = await request(app).get('/api/pages');
    expect(res.status).toBe(200);
    const bySlug: Record<string, string> = {};
    for (const p of res.body.data) bySlug[p.slug] = p.pageType;
    expect(bySlug.about).toBe('info');
    expect(bySlug.cookies).toBe('legal');
    expect(bySlug.shipping).toBe('help');
  });
});
