import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { resetStorefrontI18n } from '../../src/modules/i18n/storefrontI18n.routes';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => {
  await cleanDatabase();
  resetStorefrontI18n();
});

describe('GET/PUT /api/i18n/storefront', () => {
  it('is public to read', async () => {
    const res = await request(app).get('/api/i18n/storefront');
    expect(res.status).toBe(200);
    expect(res.body.data.languages.some((l: any) => l.code === 'ku' && l.enabled)).toBe(true);
  });

  it('rejects customers on write', async () => {
    const { token } = await authHeader({ role: 'customer' });
    const res = await request(app)
      .put('/api/i18n/storefront')
      .set('Authorization', `Bearer ${token}`)
      .send({ languages: [{ code: 'en', name: 'English', dir: 'ltr', enabled: true }] });
    expect(res.status).toBe(403);
  });

  it('lets a manager save overlays without wiping omitted strings', async () => {
    const { token } = await authHeader({ role: 'manager' });
    const first = await request(app)
      .put('/api/i18n/storefront')
      .set('Authorization', `Bearer ${token}`)
      .send({
        languages: [
          { code: 'en', name: 'English', dir: 'ltr', enabled: true },
          { code: 'ku', name: 'کوردی', dir: 'rtl', enabled: true },
        ],
        strings: { en: { 'nav.home': 'Start' } },
      });
    expect(first.status).toBe(200);
    expect(first.body.data.strings.en['nav.home']).toBe('Start');

    const second = await request(app)
      .put('/api/i18n/storefront')
      .set('Authorization', `Bearer ${token}`)
      .send({
        languages: [
          { code: 'en', name: 'English', dir: 'ltr', enabled: false },
          { code: 'ku', name: 'کوردی', dir: 'rtl', enabled: true },
        ],
      });
    expect(second.status).toBe(200);
    expect(second.body.data.languages.find((l: any) => l.code === 'en').enabled).toBe(false);
    expect(second.body.data.strings.en['nav.home']).toBe('Start');
  });

  it('returns 500 when the overlay file cannot be written', async () => {
    const fs = await import('fs');
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('EACCES');
    });
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/i18n/storefront')
      .set('Authorization', `Bearer ${token}`)
      .send({ languages: [{ code: 'en', name: 'English', dir: 'ltr', enabled: true }] });
    spy.mockRestore();
    expect(res.status).toBe(500);
  });

  it('rejects disabling every language', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/i18n/storefront')
      .set('Authorization', `Bearer ${token}`)
      .send({ languages: [{ code: 'en', name: 'English', dir: 'ltr', enabled: false }] });
    expect(res.status).toBe(400);
  });
});
