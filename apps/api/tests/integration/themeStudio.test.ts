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
import archiver from 'archiver';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

/** Build a .zip in memory (stored, no compression — deterministic bytes). */
function makeZip(entries: Record<string, string | Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { store: true });
    const chunks: Buffer[] = [];
    archive.on('data', (c: Buffer) => chunks.push(c));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    for (const [name, content] of Object.entries(entries)) {
      archive.append(content, { name });
    }
    archive.finalize();
  });
}

/**
 * Build a raw zip whose entry names are NOT sanitised. Archiver (used by
 * makeZip) normalises `../` out of names, so a hostile package can only be
 * simulated by writing the bytes ourselves: local file header + data +
 * central directory + EOCD, all STORED (no compression).
 */
function makeRawZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  // CRC32 (table-based) — needed for the local + central headers.
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const { name, content } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(content);
    // Local file header
    local.push(
      Buffer.from('PK\x03\x04'),
      // version needed, flags, method(0=stored), mod time/date, crc,
      // compressed size, uncompressed size, name len, extra len
      Buffer.from([20, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      content
    );
    central.push(
      Buffer.from('PK\x01\x02'),
      // version made by, version needed, flags, method, time, date, crc,
      // sizes, name len, extra len, comment len, disk, int attrs, ext attrs,
      // local header offset
      Buffer.from([20, 0, 20, 0, 0, 0, 0, 0, 0, 0]),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf
    );
    offset += 30 + nameBuf.length + content.length;
  }

  const centralStart = local.reduce((acc, b) => acc + b.length, 0);
  const centralSize = central.reduce((acc, b) => acc + b.length, 0);
  const end = Buffer.concat([
    Buffer.from('PK\x05\x06'),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(centralStart),
    u16(0),
  ]);
  return Buffer.concat([...local, ...central, end]);

  function u16(n: number): Buffer {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n, 0);
    return b;
  }
  function u32(n: number): Buffer {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n >>> 0, 0);
    return b;
  }
}

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

  it('refuses to delete a bundled theme (default is always protected)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    // A temp-dir theme only becomes "bundled" via the .bundled marker.
    const dir = path.join(tempDir, 'bundledmarker');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.bundled'), 'platform theme');
    fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(cfg('bundledmarker')));

    const res = await request(app).delete('/api/theme-studio/themes/bundledmarker').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BUNDLED_THEME');
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('falls back to the default theme when the active theme is deleted', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme-studio/themes/activenow')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('activenow'));
    // Make it the store's active theme.
    await mockPrisma.themeSettings.upsert({
      where: { id: 'default' },
      update: { activeTheme: 'activenow' },
      create: { id: 'default', activeTheme: 'activenow' },
    });

    const res = await request(app).delete('/api/theme-studio/themes/activenow').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.fellBackToDefault).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'activenow'))).toBe(false);
    const settings = await mockPrisma.themeSettings.findUnique({ where: { id: 'default' } });
    expect(settings.activeTheme).toBe('default');
  });

  it('deletes a non-active theme without touching the settings', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme-studio/themes/side')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('side'));
    await mockPrisma.themeSettings.upsert({
      where: { id: 'default' },
      update: { activeTheme: 'pulse' },
      create: { id: 'default', activeTheme: 'pulse' },
    });
    const res = await request(app).delete('/api/theme-studio/themes/side').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.fellBackToDefault).toBe(false);
    const settings = await mockPrisma.themeSettings.findUnique({ where: { id: 'default' } });
    expect(settings.activeTheme).toBe('pulse');
  });
});

describe('POST /api/theme-studio/install (theme packages)', () => {
  it('installs a valid zip and makes the theme appear in the catalog', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const zip = await makeZip({
      'theme.json': JSON.stringify(cfg('solar')),
      'preview.png': Buffer.from('fake-png-bytes'),
      'README.md': '# Solar\n',
    });
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'solar.zip');
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe('solar');
    expect(res.body.data.preview).toBe('/api/themes/solar/preview.png');
    expect(fs.existsSync(path.join(tempDir, 'solar', 'theme.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'solar', 'preview.png'))).toBe(true);
  });

  it('accepts a package wrapped in a single top-level folder', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const zip = await makeZip({
      'solar/theme.json': JSON.stringify(cfg('solar')),
      'solar/preview.png': Buffer.from('png'),
    });
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'solar.zip');
    expect(res.status).toBe(201);
    expect(fs.existsSync(path.join(tempDir, 'solar', 'theme.json'))).toBe(true);
  });

  it('rejects a zip without theme.json', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const zip = await makeZip({ 'readme.txt': 'hi' });
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'nope.zip');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSTALL_FAILED');
  });

  it('rejects a zip whose theme.json fails validation', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const zip = await makeZip({ 'theme.json': JSON.stringify({ key: 'bad', name: 'x' }) });
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'bad.zip');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSTALL_FAILED');
  });

  it('rejects zip-slip entry names (../ traversal)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    // makeZip sanitises names (archiver normalises `..` away), so the
    // hostile package is hand-crafted: a real `../evil.txt` entry.
    const zip = makeRawZip([
      { name: 'theme.json', content: Buffer.from(JSON.stringify(cfg('evil'))) },
      { name: '../evil.txt', content: Buffer.from('boom') },
    ]);
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'evil.zip');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSTALL_FAILED');
    expect(fs.existsSync(path.join(tempDir, 'evil'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '..', 'evil.txt'))).toBe(false);
  });

  it('rejects absolute and backslash entry names', async () => {
    const { token } = await authHeader({ role: 'admin' });
    for (const bad of ['/etc/passwd', 'C:\\windows\\evil.txt', 'a\\..\\b.txt']) {
      const zip = makeRawZip([
        { name: 'theme.json', content: Buffer.from(JSON.stringify(cfg('evil2'))) },
        { name: bad, content: Buffer.from('boom') },
      ]);
      const res = await request(app)
        .post('/api/theme-studio/install')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', zip, 'evil2.zip');
      expect(res.status).toBe(400);
      expect(fs.existsSync(path.join(tempDir, 'evil2'))).toBe(false);
    }
  });

  it('strips a smuggled .bundled marker so an installed theme stays removable', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const zip = await makeZip({
      'theme.json': JSON.stringify(cfg('smuggle')),
      '.bundled': 'i should not count',
    });
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'smuggle.zip');
    expect(res.status).toBe(201);
    expect(fs.existsSync(path.join(tempDir, 'smuggle', '.bundled'))).toBe(false);
    // And it IS removable afterwards.
    const del = await request(app).delete('/api/theme-studio/themes/smuggle').set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
  });

  it('refuses to overwrite a bundled theme key', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const dir = path.join(tempDir, 'default');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.bundled'), 'platform');
    fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(cfg('default')));
    const zip = await makeZip({ 'theme.json': JSON.stringify(cfg('default')) });
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'default.zip');
    expect(res.status).toBe(400);
    expect(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')).toContain('default');
  });

  it('updates an existing installed theme (same key) atomically', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const v1 = await makeZip({ 'theme.json': JSON.stringify({ ...cfg('evolve'), version: '1.0.0' }) });
    const r1 = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', v1, 'evolve.zip');
    expect(r1.status).toBe(201);

    const v2 = await makeZip({ 'theme.json': JSON.stringify({ ...cfg('evolve'), version: '2.0.0', name: 'Evolved' }) });
    const r2 = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', v2, 'evolve.zip');
    expect(r2.status).toBe(201);
    expect(r2.body.data.version).toBe('2.0.0');
    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'evolve', 'theme.json'), 'utf8'));
    expect(onDisk.version).toBe('2.0.0');
    expect(onDisk.name).toBe('Evolved');
    // No leftover temp/backup dirs in the themes dir.
    const leftovers = fs.readdirSync(tempDir).filter((e) => e.startsWith('.install'));
    expect(leftovers).toEqual([]);
  });

  it('requires admin/manager (403 for customers)', async () => {
    const { token } = await authHeader();
    const zip = await makeZip({ 'theme.json': JSON.stringify(cfg('nope')) });
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'nope.zip');
    expect(res.status).toBe(403);
  });

  it('rejects a non-zip upload', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('definitely not a zip'), 'theme.txt');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_A_ZIP');
  });
});

describe('GET /api/themes (public catalog)', () => {
  it('lists installed themes with validated configs', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme-studio/themes/cataloged')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('cataloged'));
    const res = await request(app).get('/api/themes');
    expect(res.status).toBe(200);
    expect(res.body.data.themes.map((t: { key: string }) => t.key)).toContain('cataloged');
    expect(res.body.data.invalid).toEqual([]);
  });

  it('reports malformed themes in `invalid` instead of dropping them silently', async () => {
    const dir = path.join(tempDir, 'broken');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'theme.json'), 'this is not json');
    const res = await request(app).get('/api/themes');
    expect(res.status).toBe(200);
    expect(res.body.data.invalid).toContain('broken');
    expect(res.body.data.themes.map((t: { key: string }) => t.key)).not.toContain('broken');
  });

  it('serves a preview image from an installed theme dir', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const zip = await makeZip({
      'theme.json': JSON.stringify(cfg('pic')),
      'preview.png': Buffer.from('PNGDATA'),
    });
    await request(app)
      .post('/api/theme-studio/install')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zip, 'pic.zip');
    const res = await request(app).get('/api/themes/pic/preview.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.body.toString()).toContain('PNGDATA');
  });

  it('404s for an unknown preview', async () => {
    const res = await request(app).get('/api/themes/ghost/preview.png');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/theme activeThemeConfig', () => {
  it('returns the on-disk config of the active theme', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme-studio/themes/withcfg')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('withcfg'));
    mockPrisma.themeSettings.upsert({
      where: { id: 'default' },
      update: { activeTheme: 'withcfg' },
      create: { id: 'default', activeTheme: 'withcfg' },
    });
    const res = await request(app).get('/api/theme');
    expect(res.status).toBe(200);
    expect(res.body.data.activeTheme).toBe('withcfg');
    expect(res.body.data.activeThemeConfig.key).toBe('withcfg');
    expect(res.body.data.activeThemeConfig.tokens.primaryColor).toBe('#123456');
  });

  it('is null when the active theme has no config on disk', async () => {
    mockPrisma.themeSettings.upsert({
      where: { id: 'default' },
      update: { activeTheme: 'ghost' },
      create: { id: 'default', activeTheme: 'ghost' },
    });
    const res = await request(app).get('/api/theme');
    expect(res.status).toBe(200);
    expect(res.body.data.activeTheme).toBe('ghost');
    expect(res.body.data.activeThemeConfig).toBeNull();
  });
});

describe('PUT /api/theme activeTheme validation (disk catalog)', () => {
  it('accepts a theme installed at runtime', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/theme-studio/themes/dynkey')
      .set('Authorization', `Bearer ${token}`)
      .send(cfg('dynkey'));
    const res = await request(app)
      .put('/api/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ activeTheme: 'dynkey' });
    expect(res.status).toBe(200);
    expect(res.body.data.activeTheme).toBe('dynkey');
  });

  it('still 400s for a key that exists nowhere', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ activeTheme: 'not-a-real-theme' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_THEME');
  });
});
