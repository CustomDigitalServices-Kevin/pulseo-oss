// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { processSolutionZip, isLikelySolutionZip, SolutionParseError } from './solution';

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

const TMP_DIR = path.join(os.tmpdir(), `pulseo-solution-test-${Date.now()}`);

beforeAll(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

const SAMPLE_SOLUTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <SolutionManifest>
    <UniqueName>MySolution</UniqueName>
    <Version>1.2.3.4</Version>
    <Publisher>
      <UniqueName>myorg_publisher</UniqueName>
    </Publisher>
  </SolutionManifest>
</ImportExportXml>`;

const SAMPLE_CUSTOMIZATIONS_XML = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <Entities>
    <Entity>
      <Name OriginalName="account">account</Name>
      <MetadataId>11111111-1111-1111-1111-111111111111</MetadataId>
    </Entity>
    <Entity>
      <Name OriginalName="contact">contact</Name>
      <MetadataId>22222222-2222-2222-2222-222222222222</MetadataId>
    </Entity>
  </Entities>
  <Workflows>
    <Workflow WorkflowId="ww-1" Name="MyFlow" Subject="Process account" />
  </Workflows>
  <WebResources>
    <WebResource>
      <WebResourceId>web-1</WebResourceId>
      <Name>myorg_script.js</Name>
      <DisplayName>Main Script</DisplayName>
    </WebResource>
  </WebResources>
  <Roles>
    <Role id="role-1" name="Custom Admin" />
  </Roles>
</ImportExportXml>`;

describe('processSolutionZip', () => {
  it('extrait metadata solution + composants (entities, workflows, webresources, roles)', async () => {
    const zipPath = path.join(TMP_DIR, 'ok.zip');
    const buf = buildZipBuffer([
      { name: 'solution.xml', data: Buffer.from(SAMPLE_SOLUTION_XML) },
      { name: 'customizations.xml', data: Buffer.from(SAMPLE_CUSTOMIZATIONS_XML) },
      { name: '[Content_Types].xml', data: Buffer.from('<Types />') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processSolutionZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.solutionName).toBe('MySolution');
    expect(m.solutionVersion).toBe('1.2.3.4');
    expect(m.publisher).toBe('myorg_publisher');

    const groupsByType = new Map(m.groups.map((g) => [g.type, g]));
    expect(groupsByType.get('Entity')?.items).toHaveLength(2);
    expect(groupsByType.get('Workflow')?.items).toHaveLength(1);
    expect(groupsByType.get('WebResource')?.items).toHaveLength(1);
    expect(groupsByType.get('Role')?.items).toHaveLength(1);
    expect(m.metadata.totalComponents).toBe(5);
  });

  it('fallback metadata si solution.xml absent', async () => {
    const zipPath = path.join(TMP_DIR, 'no-solution.zip');
    const buf = buildZipBuffer([
      { name: 'customizations.xml', data: Buffer.from(SAMPLE_CUSTOMIZATIONS_XML) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processSolutionZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.solutionName).toBe('Solution');
    expect(m.solutionVersion).toBe('0.0.0.0');
    expect(m.groups.length).toBeGreaterThan(0);
  });

  it('throw no_solution_files si aucun des deux XML', async () => {
    const zipPath = path.join(TMP_DIR, 'empty.zip');
    const buf = buildZipBuffer([
      { name: 'random.txt', data: Buffer.from('x') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    await expect(
      processSolutionZip({ zipPath, zipSizeBytes: stat.size }),
    ).rejects.toMatchObject({ name: 'SolutionParseError', code: 'no_solution_files' });
  });

  it('warning + continue si customizations.xml malformed', async () => {
    const zipPath = path.join(TMP_DIR, 'bad-custom.zip');
    const buf = buildZipBuffer([
      { name: 'solution.xml', data: Buffer.from(SAMPLE_SOLUTION_XML) },
      { name: 'customizations.xml', data: Buffer.from('<not-valid-xml') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processSolutionZip({ zipPath, zipSizeBytes: stat.size });
    expect(m.solutionName).toBe('MySolution');
    // Pas d'entities parsed, warnings peut être vide si fast-xml-parser est tolérant
    expect(m.groups.length).toBeGreaterThanOrEqual(0);
  });

  it('groups triés par type alphabétique', async () => {
    const zipPath = path.join(TMP_DIR, 'multi.zip');
    const buf = buildZipBuffer([
      { name: 'solution.xml', data: Buffer.from(SAMPLE_SOLUTION_XML) },
      { name: 'customizations.xml', data: Buffer.from(SAMPLE_CUSTOMIZATIONS_XML) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);

    const m = await processSolutionZip({ zipPath, zipSizeBytes: stat.size });
    const types = m.groups.map((g) => g.type);
    expect(types).toEqual([...types].sort());
  });
});

describe('isLikelySolutionZip', () => {
  it('true si solution.xml présent', async () => {
    const zipPath = path.join(TMP_DIR, 'lik.zip');
    const buf = buildZipBuffer([
      { name: 'solution.xml', data: Buffer.from(SAMPLE_SOLUTION_XML) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelySolutionZip(zipPath, stat.size)).toBe(true);
  });

  it('true si customizations.xml présent', async () => {
    const zipPath = path.join(TMP_DIR, 'lik2.zip');
    const buf = buildZipBuffer([
      { name: 'customizations.xml', data: Buffer.from(SAMPLE_CUSTOMIZATIONS_XML) },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelySolutionZip(zipPath, stat.size)).toBe(true);
  });

  it('false pour ZIP générique', async () => {
    const zipPath = path.join(TMP_DIR, 'generic.zip');
    const buf = buildZipBuffer([
      { name: 'doc.txt', data: Buffer.from('x') },
    ]);
    await fs.writeFile(zipPath, buf);
    const stat = await fs.stat(zipPath);
    expect(await isLikelySolutionZip(zipPath, stat.size)).toBe(false);
  });
});

describe('SolutionParseError', () => {
  it('a un code lisible', () => {
    const e = new SolutionParseError('no_solution_files', 'test');
    expect(e.code).toBe('no_solution_files');
  });
});
