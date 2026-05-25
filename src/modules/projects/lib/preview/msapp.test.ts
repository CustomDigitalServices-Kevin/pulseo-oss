// @vitest-environment node
/**
 * Tests processor MSAPP (Power Apps canvas app).
 * Reuses the same mini-ZIP builder pattern as safe-unzip.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { processMsappZip, isLikelyMsappZip, MsappParseError } from './msapp';

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function buildZipBuffer(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const cdEntries: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    let crc = 0 ^ -1;
    for (const byte of data) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
    crc = (crc ^ -1) >>> 0;
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18);
    lfh.writeUInt32LE(data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    parts.push(lfh, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    cdEntries.push(Buffer.concat([cd, nameBuf]));
    offset += lfh.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(cdEntries);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

const TMP_DIR = path.join(os.tmpdir(), `pulseo-msapp-test-${Date.now()}`);

beforeAll(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

const SAMPLE_SCREEN_YAML = `Screen1 As screen:
  Properties:
    Fill: =Color.White
  Children:
    - Button1 As button:
        Properties:
          X: =50
          Y: =100
          Width: =200
          Height: =40
          Text: ="Click me"
    - Label1 As label:
        Properties:
          X: =50
          Y: =160
          Width: =300
          Height: =30
          Text: ="Hello"
`;

const SAMPLE_SCREEN_WITH_NESTED = `HomeScreen:
  Children:
    - Gallery1 As gallery:
        Properties:
          X: =10
          Y: =10
          Width: =400
          Height: =500
        Children:
          - LabelInGallery As label:
              Properties:
                X: =20
                Y: =30
                Width: =100
                Height: =20
`;

describe('processMsappZip — happy path', () => {
  it('extrait screens + controls d\'un MSAPP simple', async () => {
    const zipPath = path.join(TMP_DIR, 'simple.msapp');
    const buf = buildZipBuffer([
      {
        name: 'CanvasManifest.json',
        data: Buffer.from(JSON.stringify({ AppName: 'MyApp', Version: '1.0' })),
      },
      { name: 'Src/Screen1.pa.yaml', data: Buffer.from(SAMPLE_SCREEN_YAML) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processMsappZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.appName).toBe('MyApp');
    expect(m.screens).toHaveLength(1);
    const screen = m.screens[0];
    expect(screen.name).toBe('Screen1');
    expect(screen.controls).toHaveLength(2);
    const btn = screen.controls.find((c) => c.id === 'Button1');
    expect(btn).toMatchObject({ type: 'button', x: 50, y: 100, w: 200, h: 40 });
    const lbl = screen.controls.find((c) => c.id === 'Label1');
    expect(lbl).toMatchObject({ type: 'label', x: 50, y: 160, w: 300, h: 30 });
  });

  it('extrait les controls nested (galerie avec Children)', async () => {
    const zipPath = path.join(TMP_DIR, 'nested.msapp');
    const buf = buildZipBuffer([
      {
        name: 'CanvasManifest.json',
        data: Buffer.from(JSON.stringify({ AppName: 'Nested' })),
      },
      { name: 'Src/Home.pa.yaml', data: Buffer.from(SAMPLE_SCREEN_WITH_NESTED) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processMsappZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.screens).toHaveLength(1);
    expect(m.screens[0].controls).toHaveLength(2);
    expect(m.screens[0].controls.map((c) => c.id)).toEqual(['Gallery1', 'LabelInGallery']);
  });

  it('plusieurs screens → plusieurs entries screens[]', async () => {
    const zipPath = path.join(TMP_DIR, 'multi.msapp');
    const buf = buildZipBuffer([
      { name: 'CanvasManifest.json', data: Buffer.from(JSON.stringify({ AppName: 'Multi' })) },
      { name: 'Src/S1.pa.yaml', data: Buffer.from(SAMPLE_SCREEN_YAML) },
      {
        name: 'Src/S2.pa.yaml',
        data: Buffer.from(`Screen2:\n  Children:\n    - Btn As button:\n        Properties:\n          X: =10\n          Y: =10\n          Width: =50\n          Height: =20\n`),
      },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processMsappZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.screens).toHaveLength(2);
    expect(m.metadata.controlCount).toBe(3);
  });
});

describe('processMsappZip — edge cases', () => {
  it('throw no_screens si pas de .pa.yaml', async () => {
    const zipPath = path.join(TMP_DIR, 'empty.msapp');
    const buf = buildZipBuffer([
      { name: 'CanvasManifest.json', data: Buffer.from('{}') },
      { name: 'Assets/image.png', data: Buffer.from('fake') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    await expect(
      processMsappZip({ zipPath, zipSizeBytes: stat.size }),
    ).rejects.toMatchObject({ name: 'MsappParseError', code: 'no_screens' });
  });

  it('fallback appName="Power Apps" si CanvasManifest absent', async () => {
    const zipPath = path.join(TMP_DIR, 'no-manifest.msapp');
    const buf = buildZipBuffer([
      { name: 'Src/S.pa.yaml', data: Buffer.from(SAMPLE_SCREEN_YAML) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processMsappZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.appName).toBe('Power Apps');
  });

  it('warning + skip pour YAML invalide', async () => {
    const zipPath = path.join(TMP_DIR, 'bad-yaml.msapp');
    const buf = buildZipBuffer([
      { name: 'CanvasManifest.json', data: Buffer.from('{}') },
      { name: 'Src/Bad.pa.yaml', data: Buffer.from(':\n\t\tinvalid yaml\n:::\nfoo: bar:baz:') },
      { name: 'Src/Ok.pa.yaml', data: Buffer.from(SAMPLE_SCREEN_YAML) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processMsappZip({ zipPath, zipSizeBytes: stat.size });
    // OK screen parsé, Bad skipé (warning ou missing — au moins 1 screen)
    expect(m.screens.length).toBeGreaterThanOrEqual(1);
  });

  it('formules Power Fx dynamiques → valeurs default (0/0/100/40)', async () => {
    const zipPath = path.join(TMP_DIR, 'dynamic.msapp');
    const buf = buildZipBuffer([
      { name: 'CanvasManifest.json', data: Buffer.from('{}') },
      {
        name: 'Src/S.pa.yaml',
        data: Buffer.from(
          `Screen:\n  Children:\n    - Dyn As label:\n        Properties:\n          X: =App.Width * 0.5\n          Y: =If(true, 100, 200)\n          Width: =300\n          Height: =40\n`,
        ),
      },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processMsappZip({ zipPath, zipSizeBytes: stat.size });
    const ctrl = m.screens[0].controls[0];
    expect(ctrl.x).toBe(0); // formule dynamique → default
    expect(ctrl.y).toBe(0);
    expect(ctrl.w).toBe(300); // constante
    expect(ctrl.h).toBe(40);
  });
});

describe('isLikelyMsappZip', () => {
  it('true si CanvasManifest.json présent', async () => {
    const zipPath = path.join(TMP_DIR, 'lic.msapp');
    const buf = buildZipBuffer([
      { name: 'CanvasManifest.json', data: Buffer.from('{}') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelyMsappZip(zipPath, stat.size)).toBe(true);
  });

  it('true si .pa.yaml présent', async () => {
    const zipPath = path.join(TMP_DIR, 'lic-yaml.msapp');
    const buf = buildZipBuffer([
      { name: 'Src/S.pa.yaml', data: Buffer.from('Screen: {}') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelyMsappZip(zipPath, stat.size)).toBe(true);
  });

  it('false pour ZIP générique', async () => {
    const zipPath = path.join(TMP_DIR, 'generic.msapp');
    const buf = buildZipBuffer([
      { name: 'doc.txt', data: Buffer.from('x') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelyMsappZip(zipPath, stat.size)).toBe(false);
  });
});

describe('MsappParseError', () => {
  it('a un code lisible', () => {
    const e = new MsappParseError('no_screens', 'test');
    expect(e.code).toBe('no_screens');
  });
});
