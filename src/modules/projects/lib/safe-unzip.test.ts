// @vitest-environment node
/**
 * Tests safe-unzip — zip-slip, zip-bomb, entries limit, timeout.
 *
 * On crée des ZIP minimaux en mémoire via yazl pour tester les cas limites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { safeUnzip, normalizeEntryPath, UnsafeZipError } from './safe-unzip';

const TMP_DIR = path.join(os.tmpdir(), `pulseo-unzip-test-${Date.now()}`);

beforeAll(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

/**
 * Crée un fichier ZIP minimal local-file format (format ZIP basique stocké,
 * pas compressé — pour tester sans dépendre de yazl).
 *
 * Layout :
 *   [Local File Header] + [data] (répété) +
 *   [Central Directory Headers] +
 *   [End of Central Directory]
 */
function buildZipBuffer(
  entries: Array<{ name: string; data: Buffer; compressed?: boolean }>,
): Buffer {
  const parts: Buffer[] = [];
  const cdEntries: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    let data = entry.data;
    let method = 0; // STORED
    let compressedSize = data.length;
    if (entry.compressed) {
      data = zlib.deflateRawSync(entry.data);
      method = 8; // DEFLATE
      compressedSize = data.length;
    }
    // CRC32
    let crc = 0 ^ -1;
    for (const byte of entry.data) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
    }
    crc = (crc ^ -1) >>> 0;

    // Local File Header (30 bytes + name)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // signature
    lfh.writeUInt16LE(20, 4); // version
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(method, 8); // method
    lfh.writeUInt16LE(0, 10); // time
    lfh.writeUInt16LE(0, 12); // date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressedSize, 18);
    lfh.writeUInt32LE(entry.data.length, 22); // uncompressed
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28); // extra length
    parts.push(lfh, nameBuf, data);

    // CD header (46 bytes + name)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made
    cd.writeUInt16LE(20, 6); // version extract
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12); // time
    cd.writeUInt16LE(0, 14); // date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressedSize, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk number
    cd.writeUInt16LE(0, 36); // internal attr
    cd.writeUInt32LE(0, 38); // external attr
    cd.writeUInt32LE(offset, 42); // relative offset of local header
    cdEntries.push(Buffer.concat([cd, nameBuf]));

    offset += lfh.length + nameBuf.length + data.length;
  }

  const cdBuf = Buffer.concat(cdEntries);
  const cdOffset = offset;

  // End of Central Directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // disk start
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...parts, cdBuf, eocd]);
}

// CRC32 table (static)
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

async function writeZip(name: string, entries: Parameters<typeof buildZipBuffer>[0]): Promise<string> {
  const zipPath = path.join(TMP_DIR, name);
  await fs.writeFile(zipPath, buildZipBuffer(entries));
  return zipPath;
}

describe('normalizeEntryPath', () => {
  it.each([
    ['file.txt', 'file.txt'],
    ['dir/file.txt', 'dir/file.txt'],
    ['..', null],
    ['../etc/passwd', null],
    ['dir/../../etc', null],
    ['/etc/passwd', null],
    ['C:\\Windows\\file', null],
    ['dir\\file', null],
    ['', null],
    ['./file.txt', 'file.txt'],
  ])('normalizeEntryPath(%s) → %s', (input, expected) => {
    expect(normalizeEntryPath(input)).toBe(expected);
  });
});

describe('safeUnzip — happy path', () => {
  it('extrait un ZIP simple avec entries valides', async () => {
    const zipPath = await writeZip('ok.zip', [
      { name: 'a.txt', data: Buffer.from('hello') },
      { name: 'dir/b.txt', data: Buffer.from('world') },
    ]);
    const stat = await fs.stat(zipPath);
    const result = await safeUnzip(zipPath, { zipSizeBytes: stat.size });
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.path === 'a.txt')?.content.toString()).toBe('hello');
    expect(result.find((e) => e.path === 'dir/b.txt')?.content.toString()).toBe('world');
  });
});

describe('safeUnzip — attaques', () => {
  it('rejette zip-slip (../../)', async () => {
    const zipPath = await writeZip('slip.zip', [
      { name: '../../etc/passwd', data: Buffer.from('evil') },
    ]);
    const stat = await fs.stat(zipPath);
    await expect(safeUnzip(zipPath, { zipSizeBytes: stat.size })).rejects.toMatchObject({
      name: 'UnsafeZipError',
      code: 'zip_slip',
    });
  });

  it('rejette path absolu', async () => {
    const zipPath = await writeZip('abs.zip', [
      { name: '/etc/passwd', data: Buffer.from('evil') },
    ]);
    const stat = await fs.stat(zipPath);
    await expect(safeUnzip(zipPath, { zipSizeBytes: stat.size })).rejects.toMatchObject({
      code: 'zip_slip',
    });
  });

  it('yauzl normalise les antislashes en forward slashes (pas un vuln)', async () => {
    // Sur des ZIP créés avec antislashes, yauzl les convertit silencieusement
    // en forward slashes. Ça rend l'extraction safe — pas une attaque zip-slip.
    // On vérifie juste que le fichier résultant est normalisé.
    const zipPath = await writeZip('backslash.zip', [
      { name: 'dir\\file.txt', data: Buffer.from('ok') },
    ]);
    const stat = await fs.stat(zipPath);
    const result = await safeUnzip(zipPath, { zipSizeBytes: stat.size });
    // yauzl a converti \ → /. Note : si la conversion n'a PAS lieu, notre
    // normalizeEntryPath bloquerait via la check `includes('\\')` → zip_slip.
    expect(result[0].path).toBe('dir/file.txt');
  });

  it('rejette too_many_entries', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      name: `f${i}.txt`,
      data: Buffer.from(`x${i}`),
    }));
    const zipPath = await writeZip('many.zip', entries);
    const stat = await fs.stat(zipPath);
    await expect(
      safeUnzip(zipPath, { zipSizeBytes: stat.size, entriesLimit: 5 }),
    ).rejects.toMatchObject({ code: 'too_many_entries' });
  });

  it('rejette entry_too_large', async () => {
    const zipPath = await writeZip('big.zip', [
      { name: 'big.bin', data: Buffer.alloc(1024) },
    ]);
    const stat = await fs.stat(zipPath);
    await expect(
      safeUnzip(zipPath, { zipSizeBytes: stat.size, perEntryLimit: 512 }),
    ).rejects.toMatchObject({ code: 'entry_too_large' });
  });

  it('rejette ratio_exceeded (zip-bomb)', async () => {
    // 1MB de zéros = compresse à ~1KB avec DEFLATE → ratio 1000×
    const bomb = Buffer.alloc(1024 * 1024);
    const zipPath = await writeZip('bomb.zip', [
      { name: 'bomb.bin', data: bomb, compressed: true },
    ]);
    const stat = await fs.stat(zipPath);
    await expect(
      safeUnzip(zipPath, { zipSizeBytes: stat.size, ratioLimit: 10 }),
    ).rejects.toMatchObject({ code: 'ratio_exceeded' });
  });

  it('accepte un ratio < limite (pas de bomb)', async () => {
    // Content incompressible (random) → ratio ~1
    const random = Buffer.alloc(100);
    for (let i = 0; i < 100; i++) random[i] = Math.floor(Math.random() * 256);
    const zipPath = await writeZip('norm.zip', [{ name: 'r.bin', data: random }]);
    const stat = await fs.stat(zipPath);
    const result = await safeUnzip(zipPath, {
      zipSizeBytes: stat.size,
      ratioLimit: 10,
    });
    expect(result).toHaveLength(1);
  });

  it('rejette un ZIP corrompu', async () => {
    const zipPath = path.join(TMP_DIR, 'corrupt.zip');
    await fs.writeFile(zipPath, Buffer.from('not a zip file'));
    await expect(
      safeUnzip(zipPath, { zipSizeBytes: 14 }),
    ).rejects.toMatchObject({ code: 'invalid_zip' });
  });
});

describe('UnsafeZipError', () => {
  it('a un code lisible', () => {
    const e = new UnsafeZipError('zip_slip', 'test');
    expect(e.code).toBe('zip_slip');
    expect(e.name).toBe('UnsafeZipError');
    expect(e.message).toBe('test');
  });
});
