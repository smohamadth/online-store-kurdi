/**
 * Zip builders for tests.
 *
 * makeZip builds a normal stored .zip (archiver). makeRawZip builds a
 * hand-rolled stored .zip whose entry names are NOT sanitised: archiver
 * normalises `../` out of names, so hostile packages (zip-slip) can only be
 * simulated by writing the bytes ourselves.
 */
import archiver from 'archiver';

/** Build a .zip in memory (stored, no compression — deterministic bytes). */
export function makeZip(entries: Record<string, string | Buffer>): Promise<Buffer> {
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
 * Build a raw zip whose entry names are literal. local file header + data +
 * central directory + EOCD, all STORED (no compression).
 *
 * `mode` (optional) sets the unix file-type bits in the central directory's
 * external attributes (e.g. 0o120000 = symlink), which is how yauzl detects
 * symlink entries.
 */
export function makeRawZip(entries: Array<{ name: string; content: Buffer; mode?: number }>): Buffer {
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

  for (const { name, content, mode } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(content);
    local.push(
      Buffer.from('PK\x03\x04'),
      Buffer.from([20, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      content
    );
    // Central directory fixed part (46 bytes before the name): signature(4)
    // + version made by(2) + version needed(2) + flags(2) + method(2) +
    // time(2) + date(2) + crc(4) + csize(4) + usize(4) + namelen(2) +
    // extralen(2) + commentlen(2) + disk(2) + internal attrs(2) +
    // external attrs(4) + local offset(4).
    central.push(
      Buffer.from('PK\x01\x02'),
      Buffer.from([20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(mode ? (mode << 16) >>> 0 : 0),
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
