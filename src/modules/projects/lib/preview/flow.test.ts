// @vitest-environment node
/**
 * Tests processor flow Power Automate.
 * Builder `buildManifest` testé avec différents shapes JSON.
 * `processFlowZip` testé via un vrai mini-ZIP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  buildManifest,
  processFlowZip,
  FlowParseError,
  isLikelyFlowZip,
} from './flow';

// ZIP builder réutilisé depuis safe-unzip tests (simplified version stored)
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
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(0, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18);
    lfh.writeUInt32LE(data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    parts.push(lfh, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    cdEntries.push(Buffer.concat([cd, nameBuf]));
    offset += lfh.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(cdEntries);
  const cdOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

const TMP_DIR = path.join(os.tmpdir(), `pulseo-flow-test-${Date.now()}`);

beforeAll(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

async function writeFlowZip(name: string, defJson: unknown): Promise<string> {
  const zipPath = path.join(TMP_DIR, name);
  const buf = buildZipBuffer([
    { name: 'definition.json', data: Buffer.from(JSON.stringify(defJson)) },
  ]);
  await fs.writeFile(zipPath, buf);
  return zipPath;
}

describe('buildManifest — structures standard Power Automate', () => {
  it('extrait trigger + 1 action liée', () => {
    const m = buildManifest({
      definition: {
        triggers: { When_http: { type: 'Request' } },
        actions: { Compose_result: { type: 'Compose', runAfter: {} } },
      },
    });
    expect(m.nodes).toHaveLength(2);
    expect(m.nodes.find((n) => n.kind === 'trigger')?.id).toBe('When_http');
    expect(m.nodes.find((n) => n.kind === 'action')?.id).toBe('Compose_result');
    expect(m.edges).toHaveLength(1);
    expect(m.edges[0]).toMatchObject({
      source: 'When_http',
      target: 'Compose_result',
    });
  });

  it('gère les chaines d\'actions via runAfter', () => {
    const m = buildManifest({
      definition: {
        triggers: { When_run: { type: 'Manual' } },
        actions: {
          Get_items: { type: 'ApiConnection', runAfter: {} },
          Compose: {
            type: 'Compose',
            runAfter: { Get_items: ['Succeeded'] },
          },
          Send_mail: {
            type: 'ApiConnection',
            runAfter: { Compose: ['Succeeded', 'Failed'] },
          },
        },
      },
    });
    expect(m.nodes).toHaveLength(4);
    expect(m.edges).toHaveLength(3);

    const toCompose = m.edges.find((e) => e.target === 'Compose');
    expect(toCompose?.source).toBe('Get_items');

    const toMail = m.edges.find((e) => e.target === 'Send_mail');
    expect(toMail?.statuses).toEqual(['Succeeded', 'Failed']);
  });

  it('accepte properties.definition wrapper (v2 packaging)', () => {
    const m = buildManifest({
      properties: {
        definition: {
          triggers: { T: { type: 'Request' } },
          actions: { A: { type: 'Compose', runAfter: {} } },
        },
      },
    });
    expect(m.nodes).toHaveLength(2);
  });

  it('accepte structure racine sans wrapper definition', () => {
    const m = buildManifest({
      triggers: { T: { type: 'Request' } },
      actions: { A: { type: 'Compose', runAfter: {} } },
    });
    expect(m.nodes).toHaveLength(2);
  });

  it('warning si aucun noeud extrait', () => {
    const m = buildManifest({ definition: { triggers: {}, actions: {} } });
    expect(m.nodes).toHaveLength(0);
    expect(m.metadata.parseWarnings).toContain('Aucun noeud extrait — structure inconnue');
  });

  it('throw FlowParseError si pas de clé definition', () => {
    expect(() => buildManifest({ random: 'garbage' })).toThrow(FlowParseError);
  });

  it('metadata count correct', () => {
    const m = buildManifest({
      definition: {
        triggers: { T1: { type: 'R' }, T2: { type: 'R' } },
        actions: { A: { type: 'C', runAfter: {} } },
      },
    });
    expect(m.metadata.triggerCount).toBe(2);
    expect(m.metadata.actionCount).toBe(1);
  });

  it('handle action.type non-string (fallback unknown)', () => {
    const m = buildManifest({
      definition: {
        triggers: { T: {} },
        actions: { A: { runAfter: {} } },
      },
    });
    expect(m.nodes.find((n) => n.kind === 'action')?.type).toBe('unknown');
  });
});

describe('processFlowZip — bout en bout', () => {
  it('parse ZIP valide', async () => {
    const zipPath = await writeFlowZip('ok.zip', {
      definition: {
        triggers: { T: { type: 'Request' } },
        actions: { A: { type: 'Compose', runAfter: {} } },
      },
    });
    const stat = await fs.stat(zipPath);
    const m = await processFlowZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.nodes).toHaveLength(2);
  });

  it('throw FlowParseError si pas de definition.json', async () => {
    const zipPath = path.join(TMP_DIR, 'bad.zip');
    const buf = buildZipBuffer([
      { name: 'random.txt', data: Buffer.from('xxx') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    await expect(
      processFlowZip({ zipPath, zipSizeBytes: stat.size }),
    ).rejects.toMatchObject({ name: 'FlowParseError', code: 'no_definition' });
  });

  it('throw FlowParseError si JSON mal formé', async () => {
    const zipPath = path.join(TMP_DIR, 'bad-json.zip');
    const buf = buildZipBuffer([
      { name: 'definition.json', data: Buffer.from('not json') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    await expect(
      processFlowZip({ zipPath, zipSizeBytes: stat.size }),
    ).rejects.toMatchObject({ code: 'invalid_json' });
  });
});

describe('isLikelyFlowZip', () => {
  it('true pour ZIP avec definition.json', async () => {
    const zipPath = await writeFlowZip('flow.zip', { definition: {} });
    const stat = await fs.stat(zipPath);
    expect(await isLikelyFlowZip(zipPath, stat.size)).toBe(true);
  });

  it('false pour ZIP random', async () => {
    const zipPath = path.join(TMP_DIR, 'random.zip');
    const buf = buildZipBuffer([{ name: 'readme.txt', data: Buffer.from('x') }]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelyFlowZip(zipPath, stat.size)).toBe(false);
  });

  it('false silencieusement sur ZIP corrompu', async () => {
    const zipPath = path.join(TMP_DIR, 'corrupt.zip');
    await fs.writeFile(zipPath, Buffer.from('not a zip'));
    expect(await isLikelyFlowZip(zipPath, 14)).toBe(false);
  });
});
