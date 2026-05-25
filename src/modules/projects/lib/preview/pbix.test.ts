// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import iconv from 'iconv-lite';
import { processPbixZip, buildPbixManifest, isLikelyPbixZip, PbixParseError } from './pbix';

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

const TMP_DIR = path.join(os.tmpdir(), `pulseo-pbix-test-${Date.now()}`);

beforeAll(async () => { await fs.mkdir(TMP_DIR, { recursive: true }); });
afterAll(async () => { await fs.rm(TMP_DIR, { recursive: true, force: true }); });

const SAMPLE_LAYOUT = {
  config: '{}',
  sections: [
    {
      name: 'ReportSection1',
      displayName: 'Overview',
      width: 1280,
      height: 720,
      visualContainers: [
        {
          id: 1001,
          x: 50,
          y: 50,
          width: 400,
          height: 300,
          config: JSON.stringify({
            name: 'visual_1',
            singleVisual: {
              visualType: 'barChart',
              vcObjects: {
                title: [
                  {
                    properties: {
                      text: { expr: { Literal: { Value: "'Sales'" } } },
                    },
                  },
                ],
              },
            },
          }),
        },
        {
          id: 1002,
          x: 500,
          y: 50,
          width: 300,
          height: 300,
          config: JSON.stringify({ singleVisual: { visualType: 'pieChart' } }),
        },
      ],
    },
    {
      name: 'ReportSection2',
      displayName: 'Detail',
      width: 1280,
      height: 720,
      visualContainers: [
        {
          id: 2001,
          x: 0,
          y: 0,
          width: 1280,
          height: 720,
          config: JSON.stringify({ singleVisual: { visualType: 'table' } }),
        },
      ],
    },
  ],
};

function writeLayout(obj: unknown): Buffer {
  // Encode UTF-16LE avec BOM — format PBIX standard
  return Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(JSON.stringify(obj), 'utf-16le')]);
}

describe('buildPbixManifest', () => {
  it('extrait pages + visuals', () => {
    const m = buildPbixManifest(SAMPLE_LAYOUT);
    expect(m.pages).toHaveLength(2);
    expect(m.metadata.visualCount).toBe(3);

    const p1 = m.pages[0];
    expect(p1.name).toBe('ReportSection1');
    expect(p1.displayName).toBe('Overview');
    expect(p1.visuals).toHaveLength(2);

    const bar = p1.visuals[0];
    expect(bar.type).toBe('barChart');
    expect(bar.title).toBe('Sales');
    expect(bar.x).toBe(50);
    expect(bar.w).toBe(400);
  });

  it('warning si sections vide', () => {
    const m = buildPbixManifest({ sections: [] });
    expect(m.pages).toHaveLength(0);
    expect(m.metadata.parseWarnings.length).toBeGreaterThan(0);
  });

  it('fallback visualType=unknown si config mal formé', () => {
    const m = buildPbixManifest({
      sections: [
        {
          name: 's', displayName: 's', width: 100, height: 100,
          visualContainers: [{ id: 1, x: 0, y: 0, width: 10, height: 10, config: 'not json' }],
        },
      ],
    });
    expect(m.pages[0].visuals[0].type).toBe('unknown');
  });

  it('Layout sans sections → warning + empty pages', () => {
    const m = buildPbixManifest({});
    expect(m.pages).toHaveLength(0);
    expect(m.metadata.parseWarnings.length).toBeGreaterThan(0);
  });
});

describe('processPbixZip', () => {
  it('parse un .pbix minimal avec UTF-16LE Layout', async () => {
    const zipPath = path.join(TMP_DIR, 'sample.pbix');
    const buf = buildZipBuffer([
      { name: 'Report/Layout', data: writeLayout(SAMPLE_LAYOUT) },
      { name: 'DataModel', data: Buffer.from([0, 0, 0]) },
      { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processPbixZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.pages).toHaveLength(2);
    expect(m.metadata.visualCount).toBe(3);
  });

  it('throw no_layout si Report/Layout absent', async () => {
    const zipPath = path.join(TMP_DIR, 'no-layout.pbix');
    const buf = buildZipBuffer([
      { name: 'DataModel', data: Buffer.from([0]) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    await expect(
      processPbixZip({ zipPath, zipSizeBytes: stat.size }),
    ).rejects.toMatchObject({ name: 'PbixParseError', code: 'no_layout' });
  });

  it('throw invalid_layout_json si Layout corrompu', async () => {
    const zipPath = path.join(TMP_DIR, 'bad-layout.pbix');
    const corruptLayout = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      iconv.encode('not json', 'utf-16le'),
    ]);
    const buf = buildZipBuffer([
      { name: 'Report/Layout', data: corruptLayout },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    await expect(
      processPbixZip({ zipPath, zipSizeBytes: stat.size }),
    ).rejects.toMatchObject({ code: 'invalid_layout_json' });
  });
});

describe('isLikelyPbixZip', () => {
  it('true si Report/Layout présent', async () => {
    const zipPath = path.join(TMP_DIR, 'lik.pbix');
    const buf = buildZipBuffer([
      { name: 'Report/Layout', data: writeLayout({ sections: [] }) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelyPbixZip(zipPath, stat.size)).toBe(true);
  });

  it('true si DataModel présent', async () => {
    const zipPath = path.join(TMP_DIR, 'lik2.pbix');
    const buf = buildZipBuffer([{ name: 'DataModel', data: Buffer.from([0]) }]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelyPbixZip(zipPath, stat.size)).toBe(true);
  });

  it('false pour ZIP générique', async () => {
    const zipPath = path.join(TMP_DIR, 'gen.pbix');
    const buf = buildZipBuffer([{ name: 'readme.txt', data: Buffer.from('x') }]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelyPbixZip(zipPath, stat.size)).toBe(false);
  });
});

describe('PbixParseError', () => {
  it('a un code lisible', () => {
    const e = new PbixParseError('no_layout', 'test');
    expect(e.code).toBe('no_layout');
  });
});
