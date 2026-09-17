/** Design operations must have explicit, non-overlapping persistence boundaries. */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';

let app: Express;
let directory: string;
const originalDirectory = process.env.THEMES_DIR;
const makeTheme = () => ({
  key: 'brand', name: 'Brand', description: 'Reusable template', version: '1.0.0', author: 'Admin',
  preview: '/themes/default/preview.png', features: { rtl: true, darkMode: false, paid: false },
  tokens: { primaryColor: '#112233' },
  layouts: { home: { columns: 12, gap: 24, blocks: [
    { id: 'gallery', type: 'gallery', rowStart: 2, colStart: 1, colSpan: 12, rowSpan: 1, config: { title: 'Gallery', items: [{ src: '/uploads/one.jpg' }] } },
    { id: 'intro', type: 'cta', rowStart: 1, colStart: 1, colSpan: 12, rowSpan: 1, config: { title: 'Template heading', html: '<p>Safe<script>bad()</script></p>' } },
  ] } },
});

async function writeTheme(theme: any) {
  await fs.mkdir(path.join(directory, theme.key), { recursive: true });
  await fs.writeFile(path.join(directory, theme.key, 'theme.json'), JSON.stringify(theme));
}

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'store-design-test-'));
  process.env.THEMES_DIR = directory;
  app = await getTestApp();
});
afterAll(async () => {
  if (originalDirectory === undefined) delete process.env.THEMES_DIR;
  else process.env.THEMES_DIR = originalDirectory;
  await fs.rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await cleanDatabase();
  await writeTheme(makeTheme());
  await mockPrisma.themeSettings.create({ data: { id: 'default', activeTheme: 'brand', primaryColor: '#abcdef', showFeatured: false } });
  await mockPrisma.homeSection.create({ data: { id: 'live', key: 'live', type: 'cta', title: 'Existing homepage', isVisible: true, sortOrder: 10, config: '{}' } });
});

async function apply(themeKey: unknown = 'brand', role: 'admin' | 'manager' | 'customer' = 'admin') {
  const { token } = await authHeader({ role });
  return request(app).post('/api/home-sections/apply-theme').set('Authorization', `Bearer ${token}`).send(themeKey === undefined ? {} : { themeKey });
}

async function expectOriginalHome() {
  const { body } = await request(app).get('/api/home-sections');
  expect(body.data).toHaveLength(1);
  expect(body.data[0]).toMatchObject({ id: 'live', title: 'Existing homepage', isVisible: true });
}

describe('design persistence boundaries', () => {
  it('saving a theme definition does not replace homepage rows or overwrite live style customizations', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const theme = makeTheme();
    theme.tokens.primaryColor = '#ff0000';
    const saved = await request(app).put('/api/theme-studio/themes/brand').set('Authorization', `Bearer ${token}`).send(theme);
    expect(saved.status).toBe(200);
    await expectOriginalHome();
    expect((await request(app).get('/api/theme')).body.data.primaryColor).toBe('#abcdef');
  });

  it('saving appearance or old visibility tokens cannot rewrite HomeSection visibility', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).put('/api/theme').set('Authorization', `Bearer ${token}`)
      .send({ activeTheme: 'brand', primaryColor: '#112233', showFeatured: false, showNewsletter: false });
    expect(res.status).toBe(200);
    await expectOriginalHome();
  });

  it('explicit replacement maps the saved template in order without applying its styling', async () => {
    const res = await apply();
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ themeKey: 'brand', usedFallback: false });
    expect(res.body.data.map((row: any) => row.type)).toEqual(['cta', 'gallery']);
    expect(res.body.data.map((row: any) => row.sortOrder)).toEqual([10, 20]);
    expect(res.body.data[0].title).toBe('Template heading');
    expect(res.body.data[0].config.html).not.toContain('<script>');
    expect(res.body.data[1].config.items[0].image).toBe('/uploads/one.jpg');
    expect(res.body.data.some((row: any) => row.id === 'live')).toBe(false);
    expect((await request(app).get('/api/theme')).body.data.primaryColor).toBe('#abcdef');
    expect(typeof vi.mocked(mockPrisma.$transaction).mock.calls.at(-1)?.[0]).toBe('function');
  });

  it('uses the saved active theme for Home editor requests, not an unsaved browser selection', async () => {
    const { token } = await authHeader({ role: 'manager' });
    const res = await request(app).post('/api/home-sections/apply-theme').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.meta.themeKey).toBe('brand');
  });

  it('is a one-time copy: later template edits do not silently change the live home', async () => {
    expect((await apply()).status).toBe(200);
    const theme = makeTheme();
    theme.layouts.home.blocks[1].config.title = 'New template revision';
    await writeTheme(theme);
    const before = await request(app).get('/api/home-sections');
    expect(before.body.data[0].title).toBe('Template heading');
    const after = await apply();
    expect(after.body.data[0].title).toBe('New template revision');
  });
});

describe('safe homepage replacement', () => {
  it.each([undefined, {}, { home: { blocks: [] } }])('does not substitute platform defaults for an absent/empty template (%j)', async (layouts) => {
    await writeTheme({ ...makeTheme(), layouts });
    const res = await apply();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_HOME_TEMPLATE');
    await expectOriginalHome();
  });

  it('rejects unknown themes without deleting the current homepage', async () => {
    expect((await apply('missing')).status).toBe(404);
    await expectOriginalHome();
  });

  it.each([null, 42, '', '../brand'])('rejects an invalid explicit key rather than falling back to the active theme (%j)', async (themeKey) => {
    expect((await apply(themeKey)).status).toBe(400);
    await expectOriginalHome();
  });

  it('requires an authenticated admin or manager', async () => {
    expect((await request(app).post('/api/home-sections/apply-theme').send({ themeKey: 'brand' })).status).toBe(401);
    expect((await apply('brand', 'customer')).status).toBe(403);
    await expectOriginalHome();
  });

  it.each(['invalid-block', 'too-many', 'long-heading'])('validates the whole replacement before deletion (%s)', async (kind) => {
    const theme: any = makeTheme();
    if (kind === 'invalid-block') theme.layouts.home.blocks[1].type = 'unknown-block';
    if (kind === 'too-many') theme.layouts.home.blocks = Array.from({ length: 101 }, (_, i) => ({ ...theme.layouts.home.blocks[0], id: `block-${i}` }));
    if (kind === 'long-heading') theme.layouts.home.blocks[1].config.title = 'x'.repeat(201);
    await writeTheme(theme);
    const res = await apply();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_HOME_TEMPLATE');
    await expectOriginalHome();
  });

  it('reports a failed transaction without claiming that the homepage was replaced', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('Injected transaction failure'));
    const res = await apply();
    expect(res.status).toBe(500);
    expect(typeof vi.mocked(mockPrisma.$transaction).mock.calls.at(-1)?.[0]).toBe('function');
    await expectOriginalHome();
  });
});
