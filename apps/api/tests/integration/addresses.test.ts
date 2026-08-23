/**
 * Address integration tests.
 *
 * The "first address is automatically default" rule and the
 * "promoting a new default clears the old one" rule are the two
 * non-trivial branches here.
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

const addressBody = (over: any = {}) => ({
  firstName: 'A',
  lastName: 'B',
  address1: '123 Main',
  city: 'NYC',
  state: 'NY',
  postalCode: '10001',
  country: 'US',
  ...over,
});

describe('GET /api/addresses', () => {
  it('returns the user addresses ordered default-first', async () => {
    const { token, user } = await authHeader();
    await mockPrisma.address.create({ data: { ...addressBody({ firstName: 'X' }), userId: user.id, isDefault: false } });
    await mockPrisma.address.create({ data: { ...addressBody({ firstName: 'Y' }), userId: user.id, isDefault: true } });
    const res = await request(app).get('/api/addresses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].firstName).toBe('Y');
  });
});

describe('POST /api/addresses', () => {
  it('makes the first address default automatically', async () => {
    const { token, user } = await authHeader();
    const res = await request(app)
      .post('/api/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(addressBody());
    expect(res.status).toBe(201);
    const after = await mockPrisma.address.findMany({ where: { userId: user.id } });
    expect(after[0].isDefault).toBe(true);
  });

  it('demotes the previous default when a new one is added', async () => {
    const { token, user } = await authHeader();
    const a1 = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send(addressBody({ firstName: 'A1' }));
    expect(a1.body.data.isDefault).toBe(true);
    const a2 = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send(addressBody({ firstName: 'A2', isDefault: true }));
    expect(a2.body.data.isDefault).toBe(true);
    const all = await mockPrisma.address.findMany({ where: { userId: user.id } });
    expect(all.filter((a) => a.isDefault)).toHaveLength(1);
  });

  it('400 on a too-short country code', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(addressBody({ country: 'USA' }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/addresses/:id', () => {
  it('updates an address that belongs to the user', async () => {
    const { token, user } = await authHeader();
    const a = await mockPrisma.address.create({ data: { ...addressBody(), userId: user.id } });
    const res = await request(app)
      .put(`/api/addresses/${a.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'Boston' });
    expect(res.status).toBe(200);
    const after = await mockPrisma.address.findUnique({ where: { id: a.id } });
    expect(after?.city).toBe('Boston');
  });

  it('404 for an address that belongs to someone else', async () => {
    const { token, user: a } = await authHeader();
    const { user: b } = await authHeader();
    const addr = await mockPrisma.address.create({ data: { ...addressBody(), userId: b.id } });
    const res = await request(app)
      .put(`/api/addresses/${addr.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/addresses/:id/default', () => {
  it('promotes a new default and demotes the old one', async () => {
    const { token, user } = await authHeader();
    const a1 = await mockPrisma.address.create({ data: { ...addressBody(), userId: user.id, isDefault: true } });
    const a2 = await mockPrisma.address.create({ data: { ...addressBody({ firstName: 'B' }), userId: user.id, isDefault: false } });
    const res = await request(app)
      .put(`/api/addresses/${a2.id}/default`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const all = await mockPrisma.address.findMany({ where: { userId: user.id } });
    expect(all.find((a) => a.id === a2.id)?.isDefault).toBe(true);
    expect(all.find((a) => a.id === a1.id)?.isDefault).toBe(false);
  });
});

describe('DELETE /api/addresses/:id', () => {
  it('removes the address and reassigns default to another one', async () => {
    const { token, user } = await authHeader();
    const a1 = await mockPrisma.address.create({ data: { ...addressBody(), userId: user.id, isDefault: true } });
    const a2 = await mockPrisma.address.create({ data: { ...addressBody({ firstName: 'B' }), userId: user.id, isDefault: false } });
    const res = await request(app)
      .delete(`/api/addresses/${a1.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const all = await mockPrisma.address.findMany({ where: { userId: user.id } });
    expect(all).toHaveLength(1);
    expect(all[0].isDefault).toBe(true);
  });
});
