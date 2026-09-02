/**
 * Developer API integration tests (GET /api/developers*).
 *
 *   - The manifest is served, is well-formed and contains only documented
 *     public endpoints (never admin paths).
 *   - Every `auth: 'none'` GET entry in the manifest is reachable: the
 *     route answers with something other than 404 (a 400 for a missing
 *     required query param is fine — it proves the route exists).
 *   - The bootstrap bundle returns the same data the individual public
 *     endpoints return (settings, sections, banners, categories, menus),
 *     so the convenience endpoint can never drift from the real ones.
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

interface ManifestEntry {
  method: string;
  path: string;
  tag: string;
  auth: 'none' | 'optional' | 'customer';
  summary: string;
}

async function getManifest(): Promise<ManifestEntry[]> {
  const res = await request(app).get('/api/developers');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('success');
  return res.body.data.endpoints as ManifestEntry[];
}

describe('GET /api/developers (manifest)', () => {
  it('serves a well-formed manifest of public endpoints only', async () => {
    const res = await request(app).get('/api/developers');
    expect(res.status).toBe(200);
    expect(res.body.data.basePath).toBe('/api');
    expect(res.body.data.endpoints.length).toBeGreaterThanOrEqual(20);
    for (const e of res.body.data.endpoints as ManifestEntry[]) {
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(e.method);
      expect(e.path).toMatch(/^\/api\//);
      expect(['none', 'optional', 'customer']).toContain(e.auth);
      expect(typeof e.summary).toBe('string');
      expect(e.summary.length).toBeGreaterThan(10);
      // The manifest documents the public surface: no admin-only paths.
      expect(e.path).not.toMatch(/\/(all|admin|subscribers|reindex)\b/);
    }
  });

  it('serves the same manifest at /manifest', async () => {
    const [a, b] = await Promise.all([
      request(app).get('/api/developers'),
      request(app).get('/api/developers/manifest'),
    ]);
    expect(a.body.data.endpoints).toEqual(b.body.data.endpoints);
  });

  it('every auth-free GET entry in the manifest is reachable', async () => {
    const entries = await getManifest();
    const gets = entries.filter(
      (e) => e.method === 'GET' && e.auth === 'none' && !e.path.includes(':')
    );
    expect(gets.length).toBeGreaterThanOrEqual(10);
    for (const e of gets) {
      const res = await request(app).get(e.path);
      // Not 404 proves the route exists. Some endpoints legitimately 400
      // (e.g. missing query param) or return 500 only when the store has
      // no data — but a documented public route must never 404.
      expect(res.status, `${e.method} ${e.path}`).not.toBe(404);
    }
  });
});

describe('GET /api/developers/bootstrap', () => {
  it('returns every bundle member on a clean store', async () => {
    // Prime the settings row + home sections the same way the public
    // endpoints do (the bootstrap itself also seeds, mirroring
    // GET /api/home-sections).
    await request(app).get('/api/settings');
    await request(app).get('/api/home-sections');

    const res = await request(app).get('/api/developers/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      settings: expect.objectContaining({ id: 'default' }),
      sections: expect.any(Array),
      banners: [],
      categories: [],
      menus: { header: null, footer: null },
    });
  });

  it('bundle members match their individual public endpoints', async () => {
    const { token } = await authHeader({ role: 'admin' });
    // Content the storefront would actually show.
    await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Spring hero', image: '', isActive: true, position: 'hero' });
    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Clothing', slug: 'clothing', isActive: true, sortOrder: 1 });

    const [bundle, sectionsRes, bannersRes, categoriesRes] = await Promise.all([
      request(app).get('/api/developers/bootstrap'),
      request(app).get('/api/home-sections'),
      request(app).get('/api/banners'),
      request(app).get('/api/categories'),
    ]);

    const b = bundle.body.data;
    expect(b.sections).toEqual(sectionsRes.body.data);
    expect(b.banners).toEqual(bannersRes.body.data);
    expect(b.categories.map((c: any) => c.name)).toEqual(
      categoriesRes.body.data.map((c: any) => c.name)
    );
    expect(b.banners).toHaveLength(1);
    expect(b.settings).toBeTruthy();
  });

  it('is read-only: no admin fields, no mutation on repeat calls', async () => {
    const before = await request(app).get('/api/developers/bootstrap');
    const again = await request(app).get('/api/developers/bootstrap');
    expect(again.body.data.sections).toEqual(before.body.data.sections);
    const json = JSON.stringify(again.body);
    expect(json).not.toMatch(/"(password|refreshToken|accessToken|secret)"\s*:/i);
  });
});
