/**
 * Object keys for uploaded files must never be steerable by the client.
 *
 * storage.routes.ts builds the MinIO key as
 *
 *     `${folder}/${userId}/${uuid}.${ext}`
 *
 * The `folder` component has been allowlisted for a while, precisely because
 * "an unvalidated folder would let any caller write into arbitrary prefixes".
 * The extension had not: it was `file.originalname.split('.').pop()`, taken
 * straight from the multipart filename, so the same object-key confusion was
 * reachable through the last path component instead of the first.
 *
 * These pin the extension derivation. The sibling local-disk uploader
 * (services/storage.service.ts) is unaffected - it writes a fixed
 * `original.jpg` under a uuid directory.
 */
import { describe, it, expect } from 'vitest';
import { safeExtension } from '../../../src/utils/objectKey';

describe('safeExtension: derives from the validated mime type', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['application/pdf', 'pdf'],
  ])('%s -> .%s', (mime, expected) => {
    // The filename is ignored entirely when the mime type is known.
    expect(safeExtension(mime, 'whatever-the-client-said.exe')).toBe(expected);
  });

  it('is case-insensitive about the mime type', () => {
    expect(safeExtension('IMAGE/JPEG', 'x.bin')).toBe('jpg');
  });
});

describe('safeExtension: never emits a key-steering extension', () => {
  // Each of these was accepted verbatim by `originalname.split('.').pop()`.
  const HOSTILE = [
    'x.jpg/../../../../etc/passwd',
    '../../../../etc/passwd',
    'a.jpg/../../secret',
    'evil.jpg\\..\\..\\win.ini',
    'noext',
    '.htaccess',
    'a.' + 'A'.repeat(200),
    'file.jpg%00.php',
    'name.with spaces',
    'sh.php;.jpg',
    '',
  ];

  it.each(HOSTILE)('%j never yields a separator or an overlong token', (name) => {
    // Unknown mime -> the fallback path, which is the risky one.
    const ext = safeExtension('application/octet-stream', name);

    expect(ext).not.toContain('/');
    expect(ext).not.toContain('\\');
    expect(ext).not.toContain('..');
    expect(ext).not.toContain('%');
    expect(ext).not.toContain(';');
    expect(ext).not.toContain(' ');
    expect(ext.length).toBeLessThanOrEqual(8);
    expect(ext).toMatch(/^[a-z0-9]+$/);
  });

  it('falls back to bin for a traversal attempt', () => {
    expect(safeExtension('application/octet-stream', 'x.jpg/../../../../etc/passwd')).toBe('bin');
  });

  it('falls back to bin when there is no extension at all', () => {
    // The old code returned the ENTIRE filename here, since split() with no
    // separator yields the whole string.
    expect(safeExtension('application/octet-stream', 'noext')).toBe('bin');
  });

  it('keeps a plain unknown-but-reasonable extension', () => {
    expect(safeExtension('application/octet-stream', 'archive.tar')).toBe('tar');
    expect(safeExtension('application/octet-stream', 'PHOTO.JPEG')).toBe('jpeg');
  });
});

describe('the resulting object key stays inside its prefix', () => {
  it.each([
    'x.jpg/../../../../etc/passwd',
    'noext',
    '.htaccess',
    'a.' + 'A'.repeat(200),
  ])('key built from %j has exactly three segments', (name) => {
    const folder = 'products';
    const userId = 'user-123';
    const uuid = '00000000-0000-4000-8000-000000000000';
    const key = `${folder}/${userId}/${uuid}.${safeExtension('application/octet-stream', name)}`;

    expect(key.split('/')).toHaveLength(3);
    expect(key.startsWith(`${folder}/${userId}/`)).toBe(true);
    expect(key).not.toContain('..');
  });
});
