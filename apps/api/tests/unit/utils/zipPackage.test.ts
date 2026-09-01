/**
 * Shared hostile-zip extraction unit tests.
 *
 * zipPackage.ts backs BOTH the theme installer and the plugin installer, so
 * the guards are pinned here once: zip-slip, absolute paths, symlinks, size
 * bombs, entry-count bombs and the top-level-folder normalization.
 */
import { describe, it, expect } from 'vitest';
import { extractZipToMap, normalizeEntryPaths } from '../../../src/utils/zipPackage';
import { makeZip, makeRawZip } from '../../helpers/zips';

describe('extractZipToMap', () => {
  it('extracts a flat zip into a map', async () => {
    const files = await extractZipToMap(await makeZip({ 'a.txt': 'hello', 'b/c.txt': 'nested' }));
    expect(files.get('a.txt')!.toString()).toBe('hello');
    expect(files.get('b/c.txt')!.toString()).toBe('nested');
    expect(files.size).toBe(2);
  });

  it('rejects a zip-slip entry name', async () => {
    const zip = makeRawZip([
      { name: 'a.txt', content: Buffer.from('ok') },
      { name: '../evil.txt', content: Buffer.from('no') },
    ]);
    await expect(extractZipToMap(zip)).rejects.toThrow(/Unsafe|unsafe|invalid relative path/);
  });

  it('rejects an absolute or drive-letter entry name', async () => {
    for (const name of ['/etc/passwd', 'C:\\windows\\x', '\\evil']) {
      const zip = makeRawZip([{ name, content: Buffer.from('no') }]);
      await expect(extractZipToMap(zip)).rejects.toThrow();
    }
  });

  it('rejects a backslash-path entry (unix escape via \\)', async () => {
    const zip = makeRawZip([{ name: '..\\..\\evil.txt', content: Buffer.from('no') }]);
    await expect(extractZipToMap(zip)).rejects.toThrow();
  });

  it('rejects symlink entries (unix S_IFLNK mode bits)', async () => {
    // 0o120000 = symlink in the external-attribute file-type bits.
    const zip = makeRawZip([
      { name: 'link', content: Buffer.from('/etc/passwd'), mode: 0o120000 },
      { name: 'payload.txt', content: Buffer.from('x') },
    ]);
    await expect(extractZipToMap(zip)).rejects.toThrow(/Symlink/);
  });

  it('enforces the entry-count bomb cap', async () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 501; i++) entries[`f${i}.txt`] = 'x';
    await expect(extractZipToMap(await makeZip(entries))).rejects.toThrow(/entries/);
  });

  it('enforces the per-entry size cap', async () => {
    await expect(
      extractZipToMap(await makeZip({ big: 'x'.repeat(5 * 1024 * 1024 + 1) }))
    ).rejects.toThrow(/size limit/);
  });

  it('enforces the total-size cap', async () => {
    // Keep the fixture small (the default cap is 50MB — allocating that in
    // the test worker wastes heap); pass an explicit tiny cap instead.
    const entries: Record<string, string> = {};
    for (let i = 0; i < 3; i++) entries[`f${i}.bin`] = 'x'.repeat(400 * 1024);
    await expect(
      extractZipToMap(await makeZip(entries), { maxTotalBytes: 1024 * 1024 })
    ).rejects.toThrow(/total size/);
  });

  it('rejects garbage bytes that are not a zip', async () => {
    await expect(extractZipToMap(Buffer.from('this is not a zip at all'))).rejects.toThrow();
  });
});

describe('normalizeEntryPaths', () => {
  it('strips a single shared top-level folder', async () => {
    const files = await extractZipToMap(
      await makeZip({
        'pkg-1.0/theme.json': '{}',
        'pkg-1.0/readme.md': 'hi',
        'pkg-1.0/assets/logo.png': 'img',
      })
    );
    const flat = normalizeEntryPaths(files, 'theme.json');
    expect(flat.has('theme.json')).toBe(true);
    expect(flat.has('readme.md')).toBe(true);
    expect(flat.has('assets/logo.png')).toBe(true);
  });

  it('leaves a flat zip alone', async () => {
    const files = await extractZipToMap(await makeZip({ 'theme.json': '{}', 'readme.md': 'hi' }));
    const flat = normalizeEntryPaths(files, 'theme.json');
    expect(flat.size).toBe(2);
  });

  it('returns the map unchanged when entries live in multiple top-level folders (callers enforce the root file)', async () => {
    const files = await extractZipToMap(await makeZip({ 'src/main.ts': 'x', 'docs/readme.md': 'y' }));
    const flat = normalizeEntryPaths(files, 'plugin.json');
    expect(flat.has('src/main.ts')).toBe(true);
    expect(flat.has('docs/readme.md')).toBe(true);
  });
});
