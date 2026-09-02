/**
 * Menus integration tests.
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

const menuBody = (over: any = {}) => ({ name: 'Main', location: 'header', ...over });
const itemBody = (over: any = {}) => ({ label: 'Home', url: '/', ...over });

describe('GET /api/menus (admin)', () => {
  it('lists menus with items', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    await request(app).post(`/api/menus/${created.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody());
    const res = await request(app).get('/api/menus').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/menus/location/:location (public)', () => {
  it('returns the active menu for a location, or null', async () => {
    const res = await request(app).get('/api/menus/location/header');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

describe('POST /api/menus (admin)', () => {
  it('creates a menu', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    expect(res.status).toBe(201);
  });

  it('rejects a duplicate name', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const res = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/menus/:id (admin)', () => {
  it('updates a menu', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const res = await request(app).put(`/api/menus/${created.body.data.id}`).set('Authorization', `Bearer ${token}`).send({ name: 'Renamed' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/menus/:id (admin)', () => {
  it('deletes a menu', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const res = await request(app).delete(`/api/menus/${created.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('Menu items', () => {
  it('adds an item', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const res = await request(app).post(`/api/menus/${created.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody());
    expect(res.status).toBe(201);
  });

  it('rejects a javascript: item URL (stored XSS guard)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const menu = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const res = await request(app)
      .post(`/api/menus/${menu.body.data.id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send(itemBody({ url: 'javascript:alert(document.cookie)' }));
    expect(res.status).toBe(400);
  });

  it('updates an item', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const menu = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const item = await request(app).post(`/api/menus/${menu.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody());
    const res = await request(app).put(`/api/menus/items/${item.body.data.id}`).set('Authorization', `Bearer ${token}`).send({ label: 'Renamed' });
    expect(res.status).toBe(200);
  });

  it('rejects a cross-menu or self parent on update (regression: only create validated parents)', async () => {
    // The create route verifies parentId belongs to the same menu; the
    // update route used to skip it, so an item could be reparented into
    // another menu — invisible to both. Self-parenting was possible too.
    const { token } = await authHeader({ role: 'admin' });
    const menuA = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const menuB = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody({ name: 'Second' }));
    const parentA = await request(app).post(`/api/menus/${menuA.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody());
    const parentB = await request(app).post(`/api/menus/${menuB.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody());

    const cross = await request(app)
      .put(`/api/menus/items/${parentA.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: parentB.body.data.id });
    expect(cross.status).toBe(400);

    const self = await request(app)
      .put(`/api/menus/items/${parentA.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: parentA.body.data.id });
    expect(self.status).toBe(400);

    // And a same-menu parent is still accepted.
    const child = await request(app).post(`/api/menus/${menuA.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody());
    const ok = await request(app)
      .put(`/api/menus/items/${child.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: parentA.body.data.id });
    expect(ok.status).toBe(200);
  });

  it('deletes an item', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const menu = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const item = await request(app).post(`/api/menus/${menu.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody());
    const res = await request(app).delete(`/api/menus/items/${item.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('reorders items', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const menu = await request(app).post('/api/menus').set('Authorization', `Bearer ${token}`).send(menuBody());
    const a = await request(app).post(`/api/menus/${menu.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody({ label: 'A' }));
    const b = await request(app).post(`/api/menus/${menu.body.data.id}/items`).set('Authorization', `Bearer ${token}`).send(itemBody({ label: 'B' }));
    const res = await request(app).put(`/api/menus/${menu.body.data.id}/items/reorder`).set('Authorization', `Bearer ${token}`).send({ items: [
      { id: a.body.data.id, sortOrder: 2 },
      { id: b.body.data.id, sortOrder: 1 },
    ] });
    expect(res.status).toBe(200);
  });
});
