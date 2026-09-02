/**
 * Every bundled theme must ship the preview image its theme.json advertises.
 *
 * Each bundled theme declares `"preview": "/themes/<key>/preview.png"`, and
 * GET /api/themes/:key/preview.png serves whatever preview.* it finds on disk.
 * For a long time none of those files existed, so the admin theme gallery
 * rendered five broken images and the endpoint 404'd for every theme. These
 * tests keep the declaration and the file in sync in both directions.
 *
 * Regenerate the images with: node scripts/render-theme-previews.js
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const THEMES_DIR = path.resolve(__dirname, '../../../../web/themes');

/** The same candidate list getThemePreviewPath() scans. */
const PREVIEW_NAMES = ['preview.png', 'preview.jpg', 'preview.jpeg', 'preview.webp', 'preview.svg'];

const themeKeys = fs
  .readdirSync(THEMES_DIR)
  .filter((k) => fs.existsSync(path.join(THEMES_DIR, k, 'theme.json')))
  .sort();

describe('bundled theme previews', () => {
  it('found the bundled themes (guards against a vacuous pass)', () => {
    expect(themeKeys.length).toBeGreaterThanOrEqual(5);
  });

  it.each(themeKeys)('%s ships a preview image', (key) => {
    const found = PREVIEW_NAMES.filter((n) => fs.existsSync(path.join(THEMES_DIR, key, n)));
    expect(found.length).toBeGreaterThan(0);
  });

  it.each(themeKeys)('%s preview matches the path in theme.json', (key) => {
    const cfg = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, key, 'theme.json'), 'utf8'));
    if (!cfg.preview) return;

    // e.g. "/themes/default/preview.png" -> the file must exist at that name.
    const declared = path.basename(cfg.preview);
    expect(fs.existsSync(path.join(THEMES_DIR, key, declared))).toBe(true);
    expect(cfg.preview).toBe(`/themes/${key}/preview.png`);
  });

  it.each(themeKeys)('%s preview is a real, non-trivial PNG', (key) => {
    const file = path.join(THEMES_DIR, key, 'preview.png');
    const buf = fs.readFileSync(file);

    // PNG magic number - catches a truncated or mis-encoded write.
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    // Dimensions live in the IHDR chunk at bytes 16-24.
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBeGreaterThanOrEqual(1000);
    expect(height).toBeGreaterThanOrEqual(400);

    // An all-blank render would compress to almost nothing.
    expect(buf.length).toBeGreaterThan(5_000);
    // Keep the repo lean; these are committed assets.
    expect(buf.length).toBeLessThan(1_000_000);
  });
});
