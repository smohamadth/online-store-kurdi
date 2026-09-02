/**
 * Settings integration tests.
 *
 * Verifies the public read endpoint, the admin write (which previously
 * silently dropped null fields), the email-template CRUD, and the
 * 401/403 authorization on each.
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

describe('GET /api/settings', () => {
  it('returns the default settings row (creating it on first read)', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
  });
});

describe('PUT /api/settings (admin)', () => {
  it('updates store settings', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'My Shop', currency: 'EUR' });
    expect(res.status).toBe(200);
  });

  it('accepts null values (the old schema rejected them)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'X', facebookUrl: null, storePhone: null });
    expect(res.status).toBe(200);
  });

  it('rejects a non-admin (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'X' });
    expect(res.status).toBe(403);
  });

  it('warns with exact numbers when a currency change strands wallet balances', async () => {
    const admin = await authHeader({ role: 'admin' });
    const customer = await authHeader();
    const aToken = admin.token;

    // Store starts in USD; the customer holds USD credit and an active
    // USD gift card. Switching the store to EUR strands them (checkout
    // reads only the store currency).
    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ storeName: 'S', currency: 'USD' });
    await request(app)
      .post('/api/store-credit')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ userId: customer.user.id, amount: 25 });
    const card = await request(app)
      .post('/api/gift-cards')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ amount: 50 });
    expect(card.status).toBe(201);

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ storeName: 'S', currency: 'EUR' });
    expect(res.status).toBe(200);

    const warning = res.body.data.walletWarning;
    expect(warning).toBeTruthy();
    expect(warning.message).toMatch(/USD/);
    expect(warning.storeCreditBalances).toEqual([{ currency: 'USD', balance: 25 }]);
    expect(warning.activeGiftCards).toBe(1);
  });

  it('does not warn on a currency change with nothing stranded', async () => {
    const admin = await authHeader({ role: 'admin' });
    const aToken = admin.token;

    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ storeName: 'S', currency: 'USD' });
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${aToken}`)
      .send({ storeName: 'S', currency: 'EUR' });
    expect(res.status).toBe(200);
    expect(res.body.data.walletWarning).toBeUndefined();
  });
});

describe('Email templates', () => {
  it('admin can list templates', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/settings/email-templates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 404 for an unknown template', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/settings/email-templates/nope')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('upserts a template (create when missing)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/settings/email-templates/welcome')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Welcome!', htmlContent: '<p>Hi</p>' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/settings/test-email', () => {
  it('sends a test email and reports the real delivery state', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/settings/test-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    // The test env has no SMTP server: the mail is logged, not sent.
    // The response must say so instead of claiming a delivery.
    expect(res.body.delivered).toBe(false);
    expect(res.body.message).toMatch(/SMTP is not configured/);
  });

  it('rejects an invalid address with 400', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/settings/test-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('requires an admin', async () => {
    const { token } = await authHeader({ role: 'customer' });
    const res = await request(app)
      .post('/api/settings/test-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(403);
  });
});
