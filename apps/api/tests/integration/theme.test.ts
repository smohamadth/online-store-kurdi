/**
 * Theme integration tests.
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

describe('GET /api/theme (public)', () => {
  it('returns the default theme', async () => {
    const res = await request(app).get('/api/theme');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
  });
});

describe('PUT /api/theme (admin)', () => {
  it('updates theme', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ primaryColor: '#ff0000' });
    expect(res.status).toBe(200);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .put('/api/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ primaryColor: '#ff0000' });
    expect(res.status).toBe(403);
  });

  it('rejects a </style> breakout in customCss (stored XSS guard)', async () => {
    // Regression: DANGEROUS_CSS used to check only for <script> tags,
    // javascript: and expression() — a payload like
    // '</style><img src=x onerror=alert(1)>' passed and the browser
    // closed the <style> element, making the rest live HTML on every
    // storefront page.
    const { token } = await authHeader({ role: 'admin' });
    for (const css of [
      '</style><img src=x onerror=alert(1)>',
      'a{color:red}</style><script>alert(1)</script>',
      'x{background:url(javascript:alert(1))}',
      'x{behavior:expression(alert(1))}',
      'x{}</style><svg onload=alert(1)>',
      '@import url(https://evil.example/x.css);',
    ]) {
      const res = await request(app)
        .put('/api/theme')
        .set('Authorization', `Bearer ${token}`)
        .send({ customCss: css });
      expect(res.status).toBe(400);
    }
  });

  it('scrubs legacy dangerous customCss on read', async () => {
    // A row written before the </style> guard must not come back raw.
    await mockPrisma.themeSettings.create({
      data: { id: 'default', customCss: '</style><img src=x onerror=alert(1)>' },
    });
    const res = await request(app).get('/api/theme');
    expect(res.status).toBe(200);
    expect(res.body.data.customCss).toBe('');
  });
});

describe('PUT /api/theme activeTheme validation', () => {
  const INSTALLED = ['default', 'minimal', 'bold', 'dawnlight', 'pulse'];

  it('accepts every theme the web registry ships', async () => {
    const { token } = await authHeader({ role: 'admin' });
    for (const key of INSTALLED) {
      const res = await request(app)
        .put('/api/theme')
        .set('Authorization', `Bearer ${token}`)
        .send({ activeTheme: key });
      expect(res.status).toBe(200);
      expect(res.body.data.activeTheme).toBe(key);
    }
  });

  it('rejects an unknown theme with UNKNOWN_THEME', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ activeTheme: 'not-a-real-theme' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_THEME');
  });

  it('GET /api/theme returns the persisted activeTheme', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ activeTheme: 'pulse' });
    const res = await request(app).get('/api/theme');
    expect(res.status).toBe(200);
    expect(res.body.data.activeTheme).toBe('pulse');
  });
});

describe('POST /api/theme/reset (admin)', () => {
  it('resets to defaults', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/theme/reset').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
