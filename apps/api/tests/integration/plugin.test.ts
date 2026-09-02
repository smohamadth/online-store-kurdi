/**
 * Plugin integration tests — the file-based plugin lifecycle API.
 *
 * Installed plugins are DATA-ONLY: a plugin.json manifest plus config state;
 * their only effect is signed webhooks POSTed to an admin-configured URL.
 * These tests pin that behaviour:
 *   - only admins/managers can list/install/update/uninstall (403 for customers)
 *   - install validates the manifest end-to-end BEFORE writing anything
 *     (bad id, unknown hook, kind:"code", bundled id, zip-slip → 400)
 *   - install writes packages/<id>/ + state/<id>.json under a temp dir
 *   - PATCH validates config against the manifest configSchema + URL scheme
 *   - POST /:id/test dispatches a real webhook through the emitter pipeline
 *   - DELETE requires the plugin to be disabled first; bundled ids are
 *     always refused
 *
 * All file I/O is redirected to a per-run temp directory; webhook delivery
 * is captured by stubbing globalThis.fetch.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { makeZip, makeRawZip } from '../helpers/zips';
import type { Express } from 'express';

let app: Express;
let tempDir: string;

const manifest = (over: Record<string, unknown> = {}) => ({
  id: 'slack-alerts',
  name: 'Slack Alerts',
  description: 'Post order events to a Slack-compatible webhook URL',
  version: '1.2.3',
  author: 'Acme Plugins',
  kind: 'webhook',
  hooks: ['order.created', 'payment.settled'],
  permissions: ['webhook'],
  configSchema: {
    channel: { type: 'string', label: 'Channel', required: true },
    notify: { type: 'boolean', label: 'Notify on refunds', default: true },
  },
  ...over,
});

const zipFor = (m: Record<string, unknown>, extra: Record<string, string> = {}) =>
  makeZip({ 'plugin.json': JSON.stringify(m), 'README.md': '# Readme', ...extra });

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
  process.env.PLUGINS_DIR = tempDir;
  app = await getTestApp();
});

afterAll(async () => {
  await mockPrisma.$disconnect();
  if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.PLUGINS_DIR;
});

beforeEach(async () => { await cleanDatabase(); });
afterEach(async () => {
  for (const e of fs.readdirSync(tempDir)) fs.rmSync(path.join(tempDir, e), { recursive: true, force: true });
});

describe('GET /api/plugins', () => {
  it('lists the bundled code plugin in the catalog', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/plugins').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).toContain('order-logger');
    const bundled = res.body.data.find((p: any) => p.id === 'order-logger');
    expect(bundled.bundled).toBe(true);
    expect(bundled.kind).toBe('code');
    expect(bundled.enabled).toBe(true);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/plugins').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/plugins/install', () => {
  it('installs a valid webhook plugin and writes packages + state to disk', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest()), 'slack-alerts.zip');
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('slack-alerts');

    const pkg = path.join(tempDir, 'packages', 'slack-alerts', 'plugin.json');
    expect(fs.existsSync(pkg)).toBe(true);
    const state = JSON.parse(fs.readFileSync(path.join(tempDir, 'state', 'slack-alerts.json'), 'utf8'));
    expect(state.enabled).toBe(true);
    expect(typeof state.secret).toBe('string');
    expect(state.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('rejects a package without plugin.json', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await makeZip({ 'readme.txt': 'hi' }), 'x.zip');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/plugin\.json/);
  });

  it('rejects an unknown hook (install gate)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest({ hooks: ['order.shipped'] })), 'x.zip');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid plugin\.json/);
  });

  it('rejects an invalid id', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest({ id: 'Bad_Id!' })), 'x.zip');
    expect(res.status).toBe(400);
  });

  it('rejects a non-semver version', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest({ version: 'latest' })), 'x.zip');
    expect(res.status).toBe(400);
  });

  it('rejects kind:"code" (uploaded plugins are data-only)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest({ kind: 'code' })), 'x.zip');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/webhook/);
  });

  it('refuses to overwrite a bundled platform plugin id', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest({ id: 'order-logger' })), 'x.zip');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bundled/);
  });

  it('rejects a zip-slip package (../ outside the package dir)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const evil = makeRawZip([
      { name: 'plugin.json', content: Buffer.from(JSON.stringify(manifest())) },
      { name: '../evil.txt', content: Buffer.from('pwned') },
    ]);
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', evil, 'evil.zip');
    expect(res.status).toBe(400);
    expect(fs.existsSync(path.join(tempDir, 'evil.txt'))).toBe(false);
  });

  it('rejects an absolute entry name', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const evil = makeRawZip([
      { name: 'plugin.json', content: Buffer.from(JSON.stringify(manifest())) },
      { name: '/etc/cron.d/evil', content: Buffer.from('pwned') },
    ]);
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', evil, 'evil.zip');
    expect(res.status).toBe(400);
  });

  it('never lets a package plant a .bundled marker', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest(), { '.bundled': 'steal' }), 'x.zip');
    expect(res.status).toBe(201);
    expect(fs.existsSync(path.join(tempDir, 'packages', 'slack-alerts', '.bundled'))).toBe(false);
  });

  it('accepts a single top-level folder in the zip (normalized away)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const zip = await makeZip({
      'slack-alerts-1.2.3/plugin.json': JSON.stringify(manifest()),
      'slack-alerts-1.2.3/README.md': '# hi',
    });
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'slack-alerts-1.2.3.zip');
    expect(res.status).toBe(201);
    expect(fs.existsSync(path.join(tempDir, 'packages', 'slack-alerts', 'plugin.json'))).toBe(true);
  });
});

describe('PATCH /api/plugins/:id', () => {
  let token: string;

  beforeEach(async () => {
    ({ token } = await authHeader({ role: 'admin' }));
    await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest()), 'slack-alerts.zip');
  });

  it('validates config against the manifest configSchema', async () => {
    const res = await request(app)
      .patch('/api/plugins/slack-alerts')
      .set('Authorization', `Bearer ${token}`)
      .send({ config: { channel: '#general', notify: false } });
    expect(res.status).toBe(200);
    expect(res.body.data.config.channel).toBe('#general');
    expect(res.body.data.config.notify).toBe(false);
  });

  it('rejects a config missing a required field', async () => {
    const res = await request(app)
      .patch('/api/plugins/slack-alerts')
      .set('Authorization', `Bearer ${token}`)
      .send({ config: { notify: true } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/channel/);
  });

  it('rejects a non-http(s) webhook url', async () => {
    const res = await request(app)
      .patch('/api/plugins/slack-alerts')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/http/);
  });

  it('stores a valid url and masks secret config fields', async () => {
    const withSecret = await zipFor(
      manifest({
        id: 'secrets',
        configSchema: {
          token: { type: 'string', secret: true },
        },
      })
    );
    await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', withSecret, 'secrets.zip');
    const res = await request(app)
      .patch('/api/plugins/secrets')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://hooks.example.com/x', config: { token: 'abc123' } });
    expect(res.status).toBe(200);
    expect(res.body.data.config.token).toBe('••••••••');
    expect(res.body.data.bundled).toBe(false);
  });

  it('keeps a stored secret when the save round-trips the mask (no overwrite)', async () => {
    const withSecret = await zipFor(
      manifest({
        id: 'secrets',
        configSchema: {
          token: { type: 'string', secret: true },
          channel: { type: 'string' },
        },
      })
    );
    await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', withSecret, 'secrets.zip');
    await request(app)
      .patch('/api/plugins/secrets')
      .set('Authorization', `Bearer ${token}`)
      .send({ config: { token: 'abc123', channel: '#old' } });

    // The admin edits only `channel`; the UI sends the mask for `token`.
    const res = await request(app)
      .patch('/api/plugins/secrets')
      .set('Authorization', `Bearer ${token}`)
      .send({ config: { token: '••••••••', channel: '#new' } });
    expect(res.status).toBe(200);
    expect(res.body.data.config.channel).toBe('#new');
    expect(res.body.data.config.token).toBe('••••••••');

    // The REAL secret on disk must still be abc123 — never the mask.
    const state = JSON.parse(fs.readFileSync(path.join(tempDir, 'state', 'secrets.json'), 'utf8'));
    expect(state.config.token).toBe('abc123');
    expect(state.config.channel).toBe('#new');
  });

  it('cannot patch a bundled plugin', async () => {
    const res = await request(app)
      .patch('/api/plugins/order-logger')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bundled/);
  });
});

describe('POST /api/plugins/:id/test', () => {
  let token: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ token } = await authHeader({ role: 'admin' }));
    await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest()), 'slack-alerts.zip');
    await request(app)
      .patch('/api/plugins/slack-alerts')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://hooks.example.com/slack', config: { channel: '#general' } });

    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('dispatches a sample payload through the emitter and records the attempt', async () => {
    const res = await request(app)
      .post('/api/plugins/slack-alerts/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ event: 'order.created' });
    expect(res.status).toBe(200);
    expect(res.body.data.delivered).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/slack');
    const body = JSON.parse(opts.body);
    expect(body.event).toBe('order.created');
    expect(body.pluginId).toBe('slack-alerts');
    expect(body.data.orderNumber).toBeDefined();

    // HMAC signature header present (state secret is real, so just check shape)
    expect(opts.headers['X-Store-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(opts.headers['User-Agent']).toBe('store-builder-webhook/1.0');

    // Execution log recorded
    const log = await request(app)
      .get('/api/plugins/slack-alerts/log')
      .set('Authorization', `Bearer ${token}`);
    expect(log.status).toBe(200);
    expect(log.body.data[0].event).toBe('order.created');
    expect(log.body.data[0].ok).toBe(true);
  });

  it('rejects an event the plugin does not subscribe to', async () => {
    const res = await request(app)
      .post('/api/plugins/slack-alerts/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ event: 'customer.registered' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to test a disabled plugin with a readable error', async () => {
    await request(app)
      .patch('/api/plugins/slack-alerts')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });
    const res = await request(app)
      .post('/api/plugins/slack-alerts/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ event: 'order.created' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/disabled/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a failed delivery when the endpoint errors', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('boom', { status: 500 }));
    const res = await request(app)
      .post('/api/plugins/slack-alerts/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ event: 'order.created' });
    expect(res.status).toBe(200);
    expect(res.body.data.delivered).toBe(false);
    expect(res.body.data.status).toBe(500);
  });
});

describe('DELETE /api/plugins/:id', () => {
  let token: string;

  beforeEach(async () => {
    ({ token } = await authHeader({ role: 'admin' }));
    await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest()), 'slack-alerts.zip');
  });

  it('refuses to uninstall an enabled plugin (must disable first)', async () => {
    const res = await request(app)
      .delete('/api/plugins/slack-alerts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MUST_DISABLE');
    expect(fs.existsSync(path.join(tempDir, 'packages', 'slack-alerts'))).toBe(true);
  });

  it('uninstalls a disabled plugin and removes its files', async () => {
    await request(app)
      .patch('/api/plugins/slack-alerts')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });
    const res = await request(app)
      .delete('/api/plugins/slack-alerts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(tempDir, 'packages', 'slack-alerts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'state', 'slack-alerts.json'))).toBe(false);
  });

  it('refuses to uninstall a bundled plugin', async () => {
    const res = await request(app)
      .delete('/api/plugins/order-logger')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BUNDLED_PLUGIN');
  });
});

describe('emit → webhook wiring', () => {
  it('delivers order.created to a configured installed plugin (fire-and-forget path)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest({ id: 'email-orders' })), 'email-orders.zip');
    await request(app)
      .patch('/api/plugins/email-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://hooks.example.com/email' });

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // A plugin that does not subscribe to the event must not be called.
    await request(app)
      .post('/api/plugins/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await zipFor(manifest({ id: 'audit-logs', hooks: ['product.updated'] })), 'audit-logs.zip');

    // Fire through the real emitter (as the order route does).
    const { emit } = await import('../../src/modules/plugins/pluginHooks');
    await emit('order.created', {
      orderId: 'ord_1',
      orderNumber: '1001',
      totalAmount: 25,
      customer: { email: 'a@b.c' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/email');
    expect(JSON.parse(opts.body).event).toBe('order.created');

    vi.unstubAllGlobals();
  });

  it('runs bundled code handlers in-process', async () => {
    const { logger } = await import('../../src/utils/logger');
    const loggerSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    try {
      const { emit } = await import('../../src/modules/plugins/pluginHooks');
      const outcomes = await emit('order.created', { orderNumber: '42' });
      const code = outcomes.find((o) => o.kind === 'code');
      expect(code).toBeDefined();
      expect(code!.delivered).toBe(true);
    } finally {
      loggerSpy.mockRestore();
    }
  });
});
