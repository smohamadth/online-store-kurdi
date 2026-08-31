/**
 * Theme Studio integration tests — the file-based theme CRUD API.
 *
 * Themes are stored as theme.json files on disk (the "files" model). These
 * tests pin that behaviour:
 *   - only admins/managers can read/write/delete themes (403 for customers)
 *   - PUT validates the config and refuses a mismatched / malformed key
 *   - PUT writes a real theme.json file under a temp themes dir
 *   - GET /themes lists installed themes; GET /themes/:key reads one back
 *   - DELETE removes the theme directory
 *
 * All file I/O is redirected to a per-run temp directory so tests never touch
 * the real web themes dir.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
let tempDir: string;

const cfg = (key: string) => ({
  key,
  name: `Theme ${key}`,
  description: 'created by test',
  version: '1.0.0',
  author: 'Tester',
  preview: `/themes/${key}/preview.png`,
  features: { rtl: true, darkMode: false, paid: false },
  tokens: { primaryColor: '#123456', baseFontSize: 16, radius: 8 },
});

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-studio-test-'));
  process.env.THEMES_DIR = tempDir;
  app = await getTestApp();
});

afterAll(async () => {
  await mockPrisma.$disconnect();
  if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.THEMES_DIR;
});

beforeEach(async () => { await cleanDatabase(); });
afterEach(async () => {
  // Keep the temp dir clean between tests.
  for (const e of fs.readdirSync(tempDir)) fs.rmSync(path.join(tempDir, e), { recursive: true, force: true });
});

describe('GET /api/theme-studio/themes', () => {
  it('lists themes (empty by default)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/theme-studio/themes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/theme-studio/themes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/theme-studio/themes/:key', () => {
  it('writes a theme.json file and returns the config', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme-studio/themes/mybrand')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('mybrand'));
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('mybrand');

    const file = path.join(tempDir, 'mybrand', 'theme.json');
    expect(fs.existsSync(file)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(onDisk.name).toBe('Theme mybrand');
    expect(onDisk.tokens.primaryColor).toBe('#123456');
  });

  it('rejects a key that does not match the body', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme-studio/themes/branda')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('brandb'));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_THEME');
  });

  it('rejects an unsafe key', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme-studio/themes/..%2Fescape')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('escape'));
    expect(res.status).toBe(400);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .put('/api/theme-studio/themes/mybrand')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('mybrand'));
    expect(res.status).toBe(403);
  });

  it('rejects a non-semver version (would fail the web build gate)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme-studio/themes/badver')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...cfg('badver'), version: 'not-a-version' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_THEME');
  });

  it('rejects a missing author/description', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme-studio/themes/noauth')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...cfg('noauth'), author: '', description: '' });
    expect(res.status).toBe(400);
  });

  it('rejects non-boolean feature flags', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme-studio/themes/badfeat')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...cfg('badfeat'), features: { rtl: 'yes', darkMode: false, paid: false } });
    expect(res.status).toBe(400);
  });

  it('normalises the stored config and never writes unknown fields', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme-studio/themes/clean')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...cfg('clean'), junkField: 'x', another: 1 });
    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'clean', 'theme.json'), 'utf8'));
    expect(onDisk.junkField).toBeUndefined();
    expect(onDisk.key).toBe('clean');
  });
});

describe('GET /api/theme-studio/themes/:key', () => {
  it('returns a saved theme', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme-studio/themes/saved')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('saved'));
    const res = await request(app).get('/api/theme-studio/themes/saved').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('saved');
  });

  it('404s for an unknown theme', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/theme-studio/themes/nope').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/theme-studio/themes/:key', () => {
  it('deletes the theme directory', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme-studio/themes/gone')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('gone'));
    expect(fs.existsSync(path.join(tempDir, 'gone'))).toBe(true);

    const res = await request(app).delete('/api/theme-studio/themes/gone').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(tempDir, 'gone'))).toBe(false);
  });

  it('400s when the theme does not exist', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).delete('/api/theme-studio/themes/missing').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
