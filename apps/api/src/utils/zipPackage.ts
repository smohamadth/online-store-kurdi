// ---------------------------------------------------------------------------
// Safe zip extraction (shared by the theme installer and the plugin
// installer).
//
// An uploaded package is untrusted bytes. The extraction is hostile:
//   - entry names with `..`, absolute paths, backslashes or drive letters
//     are rejected (zip-slip),
//   - symlink entries are rejected (never followed),
//   - entry count and uncompressed sizes are capped (zip-bomb guard),
//   - validation happens BEFORE anything is written to disk.
//
// Both installers call `extractZipToMap` and then decide where the files
// may land; this module only turns a buffer into a validated in-memory map
// of entry name → content.
// ---------------------------------------------------------------------------
import yauzl from 'yauzl';

export interface ZipExtractOptions {
  /** Max entries in the archive (default 500). */
  maxEntries?: number;
  /** Max total uncompressed bytes (default 50 MB). */
  maxTotalBytes?: number;
  /** Max bytes per single entry (default 5 MB). */
  maxEntryBytes?: number;
}

const DEFAULTS = {
  maxEntries: 500,
  maxTotalBytes: 50 * 1024 * 1024,
  maxEntryBytes: 5 * 1024 * 1024,
};

/** Reject any entry name that could escape an extraction directory. */
export function isUnsafeEntryName(name: string): boolean {
  if (!name) return true;
  if (name.includes('\\')) return true;
  if (name.includes('..')) return true; // covers "..", "...", "a..b" — names are ours to restrict
  if (name.startsWith('/')) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  return false;
}

function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error('Could not open package'));
      else resolve(zip);
    });
  });
}

/** Read one zip entry fully into memory (capped by maxEntryBytes). */
function readZipEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, maxEntryBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error('Could not read package entry'));
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxEntryBytes) {
          stream.destroy();
          reject(new Error(`Package entry "${entry.fileName}" exceeds the size limit`));
          return;
        }
        chunks.push(c);
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

/**
 * Extract every file entry of a zip buffer into memory, applying the
 * hostile-input checks. Directories are skipped; the map keys are the raw
 * entry names (callers should normalize/validate before writing).
 */
export async function extractZipToMap(
  buffer: Buffer,
  opts: ZipExtractOptions = {}
): Promise<Map<string, Buffer>> {
  const { maxEntries, maxTotalBytes, maxEntryBytes } = { ...DEFAULTS, ...opts };
  if (!buffer || buffer.length === 0) throw new Error('Empty package');
  if (buffer.length < 4) throw new Error('Package is too small to be a zip file');

  const zip = await openZip(buffer);
  try {
    return await new Promise<Map<string, Buffer>>((resolve, reject) => {
      const files = new Map<string, Buffer>();
      let count = 0;
      let total = 0;
      let done = false;

      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        try {
          fn();
        } catch (e) {
          reject(e);
        }
      };

      zip.on('entry', (entry: yauzl.Entry) => {
        count += 1;
        if (count > maxEntries) {
          return finish(() => reject(new Error(`Package has more than ${maxEntries} entries`)));
        }
        if (isUnsafeEntryName(entry.fileName)) {
          return finish(() => reject(new Error(`Unsafe path in package: "${entry.fileName}"`)));
        }
        // Symlinks are never followed — a link pointing outside the target
        // dir would let a package plant files anywhere on disk.
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (mode === 0o120000) {
          return finish(() => reject(new Error(`Symlinks are not allowed in a package: "${entry.fileName}"`)));
        }
        if (entry.fileName.endsWith('/')) return zip.readEntry(); // directory

        readZipEntry(zip, entry, maxEntryBytes)
          .then((content) => {
            total += content.length;
            if (total > maxTotalBytes) {
              throw new Error('Package exceeds the total size limit');
            }
            files.set(entry.fileName, content);
            zip.readEntry();
          })
          .catch((e) => finish(() => reject(e)));
      });

      zip.on('end', () => finish(() => resolve(files)));
      zip.on('error', (e) => finish(() => reject(e)));
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

/**
 * Zip authors commonly wrap a package in a single top-level folder
 * (`solar/theme.json`). If every entry shares one top-level directory and
 * there is no `rootFile` at the root, strip that prefix so the package
 * lands at the root either way.
 */
export function normalizeEntryPaths(
  files: Map<string, Buffer>,
  rootFile: string
): Map<string, Buffer> {
  if (files.has(rootFile)) return files;
  const names = [...files.keys()];
  const topLevel = new Set(names.map((n) => n.split('/')[0]));
  if (topLevel.size !== 1) return files;
  const prefix = `${[...topLevel][0]}/`;
  const out = new Map<string, Buffer>();
  for (const [name, content] of files) out.set(name.slice(prefix.length), content);
  return out;
}
