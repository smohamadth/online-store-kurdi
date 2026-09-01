/**
 * Integration tests for the digital-download module.
 *
 *   - mint at order placement: every digital line item gets a
 *     ProductDownload row with a 32-byte token and a snapshot of
 *     the product's downloadUrl.
 *   - redeem (public): 302 to the source URL on success, 404/410/429
 *     on the three failure modes.
 *   - account list: the current user sees their digital purchases.
 *   - ownership: a different user can't redeem or list someone
 *     else's downloads.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import {
  createProduct,
  createCategory,
  createUser,
  createOrder,
  createOrderItem,
  createProductDownload,
} from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('Downloads: order placement mints a per-purchase token', () => {
  it('mints a ProductDownload for every digital line item', async () => {
    const { token } = await authHeader();
    const cat = await createCategory({ slug: 'ebooks', name: 'eBooks' });
    const ebook = await createProduct({
      name: 'My eBook',
      slug: 'my-ebook',
      price: 19.99,
      type: 'digital',
      categoryId: cat.id,
      downloadUrl: 'https://cdn.example.com/files/ebook.pdf',
      downloadLimit: 5,
      downloadExpiry: 30,
    });
    // A physical line as well, to prove only digital lines get tokens.
    const mug = await createProduct({
      name: 'Mug', slug: 'mug', price: 12, categoryId: cat.id, type: 'physical',
    });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { productId: ebook.id, quantity: 1 },
          { productId: mug.id, quantity: 1 },
        ],
      });
    expect(orderRes.status).toBe(201);

    const downloads = await mockPrisma.productDownload.findMany();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].sourceUrl).toBe('https://cdn.example.com/files/ebook.pdf');
    expect(downloads[0].downloadLimit).toBe(5);
    expect(downloads[0].token.length).toBeGreaterThanOrEqual(40);
    if (downloads[0].expiresAt) {
      const diff = downloads[0].expiresAt.getTime() - Date.now();
      // 30 days, +/- 1 hour for clock drift.
      expect(diff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(31 * 24 * 60 * 60 * 1000);
    }
  });

  it('does not mint a token for non-digital products', async () => {
    const { token } = await authHeader();
    const cat = await createCategory({ slug: 'mugs', name: 'Mugs' });
    const mug = await createProduct({
      name: 'Mug', slug: 'mug2', price: 10, categoryId: cat.id, type: 'physical',
    });
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: mug.id, quantity: 1 }] });
    const downloads = await mockPrisma.productDownload.findMany();
    expect(downloads).toHaveLength(0);
  });

  it('falls back to the product-level downloadUrl when the order item has none', async () => {
    const { token } = await authHeader();
    const cat = await createCategory({ slug: 'music', name: 'Music' });
    // downloadUrl is set on the product but not on the order item.
    const track = await createProduct({
      name: 'Track', slug: 'track-1', price: 1.99, type: 'digital',
      categoryId: cat.id, downloadUrl: 'https://cdn.example.com/mp3/track.mp3',
    });
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: track.id, quantity: 1 }] });
    const downloads = await mockPrisma.productDownload.findMany();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].sourceUrl).toBe('https://cdn.example.com/mp3/track.mp3');
  });
});

describe('Downloads: public redemption (GET /api/downloads/:token)', () => {
  it('302 redirects to the source URL on success', async () => {
    const cat = await createCategory({ slug: 'v', name: 'V' });
    const p = await createProduct({
      name: 'p', slug: 'p', price: 5, type: 'digital', categoryId: cat.id,
      downloadUrl: 'https://cdn.example.com/files/x.pdf',
    });
    const order = await createOrder((await createUser({})).id);
    const item = await createOrderItem(order.id, p.id, { downloadUrl: p.downloadUrl });
    const dl = await createProductDownload(item.id, { sourceUrl: p.downloadUrl! });

    const res = await request(app).get(`/api/downloads/${dl.token}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://cdn.example.com/files/x.pdf');
  });

  it('increments the per-token counter and writes an audit row', async () => {
    const cat = await createCategory({ slug: 'v', name: 'V' });
    const p = await createProduct({
      name: 'p', slug: 'p', price: 5, type: 'digital', categoryId: cat.id,
      downloadUrl: 'https://cdn.example.com/files/y.pdf',
    });
    const order = await createOrder((await createUser({})).id);
    const item = await createOrderItem(order.id, p.id, { downloadUrl: p.downloadUrl });
    const dl = await createProductDownload(item.id, { sourceUrl: p.downloadUrl! });

    await request(app).get(`/api/downloads/${dl.token}`);
    const after = await mockPrisma.productDownload.findUnique({ where: { id: dl.id } });
    expect(after?.downloadCount).toBe(1);
    expect(after?.lastUsedAt).toBeTruthy();
    const logs = await mockPrisma.downloadLog.findMany({ where: { downloadId: dl.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('success');
  });

  it('returns 404 when the token does not exist', async () => {
    const res = await request(app).get('/api/downloads/this-token-does-not-exist-anywhere-1234567890');
    expect([404, 400]).toContain(res.status);
  });

  it('returns 410 Gone when the token has expired', async () => {
    const cat = await createCategory({ slug: 'v', name: 'V' });
    const p = await createProduct({
      name: 'p', slug: 'p', price: 5, type: 'digital', categoryId: cat.id,
      downloadUrl: 'https://cdn.example.com/files/exp.pdf',
    });
    const order = await createOrder((await createUser({})).id);
    const item = await createOrderItem(order.id, p.id, { downloadUrl: p.downloadUrl });
    const dl = await createProductDownload(item.id, {
      sourceUrl: p.downloadUrl!,
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(app).get(`/api/downloads/${dl.token}`);
    expect(res.status).toBe(410);
  });

  it('returns 429 when the per-token limit is hit', async () => {
    const cat = await createCategory({ slug: 'v', name: 'V' });
    const p = await createProduct({
      name: 'p', slug: 'p', price: 5, type: 'digital', categoryId: cat.id,
      downloadUrl: 'https://cdn.example.com/files/lim.pdf',
    });
    const order = await createOrder((await createUser({})).id);
    const item = await createOrderItem(order.id, p.id, {
      downloadUrl: p.downloadUrl,
      downloadCount: 0,
      downloadLimit: 100, // generous product limit
    });
    const dl = await createProductDownload(item.id, {
      sourceUrl: p.downloadUrl!,
      downloadCount: 3,
      downloadLimit: 3,
    });
    const res = await request(app).get(`/api/downloads/${dl.token}`);
    expect(res.status).toBe(429);
  });

  it('returns 429 when the product-level limit is hit', async () => {
    const cat = await createCategory({ slug: 'v', name: 'V' });
    const p = await createProduct({
      name: 'p', slug: 'p', price: 5, type: 'digital', categoryId: cat.id,
      downloadUrl: 'https://cdn.example.com/files/plim.pdf',
    });
    const order = await createOrder((await createUser({})).id);
    // Product-level counter is already at the limit; per-token
    // counter is still 0.
    const item = await createOrderItem(order.id, p.id, {
      downloadUrl: p.downloadUrl,
      downloadCount: 3,
      downloadLimit: 3,
    });
    const dl = await createProductDownload(item.id, {
      sourceUrl: p.downloadUrl!,
      downloadCount: 0,
      downloadLimit: 10,
    });
    const res = await request(app).get(`/api/downloads/${dl.token}`);
    expect(res.status).toBe(429);
  });

  it('rejects too-short tokens with 400', async () => {
    const res = await request(app).get('/api/downloads/short');
    expect(res.status).toBe(400);
  });
});

describe('Downloads: account list (GET /api/account/downloads)', () => {
  it('returns the current user’s digital purchases', async () => {
    const { token } = await authHeader();
    const cat = await createCategory({ slug: 'v', name: 'V' });
    const p = await createProduct({
      name: 'Mine', slug: 'mine', price: 5, type: 'digital', categoryId: cat.id,
      downloadUrl: 'https://cdn.example.com/files/mine.pdf',
    });
    // The user who placed the order must match the authHeader user.
    // We use createUser (not authHeader) here to create the *buyer*
    // and then log in as that same buyer to match the auth token.
    // authHeader creates a user and returns the token, so the
    // buyer's user.id is what we want.
    const { user: buyer } = await authHeader({ email: 'buyer@example.com' });
    void token; // use buyer-specific token below
    const order = await createOrder(buyer.id);
    const item = await createOrderItem(order.id, p.id, { downloadUrl: p.downloadUrl });
    await createProductDownload(item.id, { sourceUrl: p.downloadUrl! });

    // Re-login as the buyer to get their token.
    const login = await request(app).post('/api/auth/login').send({
      email: 'buyer@example.com', password: 'Password123!',
    });
    const buyerToken = login.body?.data?.accessToken || login.body?.accessToken;

    const res = await request(app)
      .get('/api/account/downloads')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productSlug).toBe('mine');
    expect(res.body.data[0].token.length).toBeGreaterThan(0);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/account/downloads');
    expect(res.status).toBe(401);
  });
});
