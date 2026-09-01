/**
 * Payment gateway configuration integration tests.
 *
 * Pins the admin surface for enabling a gateway and storing credentials:
 *   - GET  /api/settings/payment-gateways returns definitions + stored config
 *   - PUT  /api/settings/payment-gateways persists config (admin only)
 *   - DELETE /api/settings/payment-gateways/:id clears a gateway
 *   - public GET /api/settings returns a SCRUBBED metadata list (no secrets)
 *     whose `enabled` reflects a configured gateway.
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

async function adminToken() {
  return (await authHeader({ role: 'admin' })).token;
}

describe('GET /api/settings/payment-gateways (admin)', () => {
  it('returns gateway definitions and an empty config by default', async () => {
    const res = await request(app)
      .get('/api/settings/payment-gateways')
      .set('Authorization', `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.definitions.map((d: any) => d.id);
    expect(ids).toEqual(expect.arrayContaining(['zarinpal', 'idpay', 'zaincash', 'fib', 'paypal', 'stripe']));
    expect(res.body.data.gateways).toEqual({});
  });

  it('rejects a non-admin (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/settings/payment-gateways')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/settings/payment-gateways', () => {
  it('persists config and scrubs the public settings endpoint', async () => {
    const token = await adminToken();

    const put = await request(app)
      .put('/api/settings/payment-gateways')
      .set('Authorization', `Bearer ${token}`)
      .send({ gateways: { zarinpal: { enabled: true, merchantId: 'secret-merchant' } } });
    expect(put.status).toBe(200);
    expect(put.body.data.gateways.zarinpal.merchantId).toBe('secret-merchant');

    // Admin read returns the secret.
    const adminGet = await request(app)
      .get('/api/settings/payment-gateways')
      .set('Authorization', `Bearer ${token}`);
    expect(adminGet.body.data.gateways.zarinpal.merchantId).toBe('secret-merchant');

    // Public read returns ONLY the scrubbed metadata — never the secret — and
    // marks zarinpal enabled because its required field is filled.
    const pub = await request(app).get('/api/settings');
    const zarinpal = pub.body.data.paymentGateways.find((g: any) => g.id === 'zarinpal');
    expect(zarinpal).toBeTruthy();
    expect(zarinpal.enabled).toBe(true);
    expect(JSON.stringify(pub.body)).not.toContain('secret-merchant');
    expect(JSON.stringify(pub.body).includes('paymentGateways')).toBe(true);
  });

  it('drops arbitrary keys and keeps enabled only when requested', async () => {
    const token = await adminToken();
    const res = await request(app)
      .put('/api/settings/payment-gateways')
      .set('Authorization', `Bearer ${token}`)
      .send({ gateways: { paypal: { enabled: true, clientId: 'cid', hacked: 'x' } } });
    expect(res.status).toBe(200);
    expect(res.body.data.gateways.paypal.clientId).toBe('cid');
    expect(res.body.data.gateways.paypal.hacked).toBeUndefined();
  });
});

describe('DELETE /api/settings/payment-gateways/:id', () => {
  it('clears a gateway config', async () => {
    const token = await adminToken();
    await request(app)
      .put('/api/settings/payment-gateways')
      .set('Authorization', `Bearer ${token}`)
      .send({ gateways: { idpay: { enabled: true, apiKey: 'k' } } });
    const del = await request(app)
      .delete('/api/settings/payment-gateways/idpay')
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const pub = await request(app).get('/api/settings');
    const idpay = pub.body.data.paymentGateways.find((g: any) => g.id === 'idpay');
    expect(idpay.enabled).toBe(false);
  });
});
