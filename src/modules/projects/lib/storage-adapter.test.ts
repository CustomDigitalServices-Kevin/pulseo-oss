/**
 * @vitest-environment node
 *
 * Tests LocalDiskAdapter — vérifie contract streaming + maxBytes guard +
 * anti-traversal + idempotence delete.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import os from 'os';

// STORAGE_PATH doit être set AVANT l'import de storage-adapter — sinon la
// constante module-level PROJECTS_ROOT capture '/opt/pulseo-storage'.
const TMP_ROOT = path.join(os.tmpdir(), `pulseo-storage-test-${Date.now()}`);
process.env.STORAGE_PATH = TMP_ROOT;

const { LocalDiskAdapter } = await import('./storage-adapter');

const ORG_ID = 'org-test';
const PROJECT_ID = 'proj-test';

function streamFromBuffer(buf: Buffer): Readable {
  return Readable.from([buf]);
}

function streamFromChunks(chunks: Buffer[]): Readable {
  return Readable.from(chunks);
}

describe('LocalDiskAdapter', () => {
  const adapter = new LocalDiskAdapter();

  beforeAll(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean between tests
    const projRoot = path.join(TMP_ROOT, 'projects');
    await fs.rm(projRoot, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('écrit un petit fichier et retourne key + sizeBytes', async () => {
      const content = Buffer.from('hello world');
      const result = await adapter.upload({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        scope: 'deliverables',
        originalName: 'test.pdf',
        stream: streamFromBuffer(content),
        maxBytes: 1024,
      });
      expect(result.sizeBytes).toBe(11);
      expect(result.key).toContain(ORG_ID);
      expect(result.key).toContain(PROJECT_ID);
      expect(result.key).toContain('deliverables');
      expect(result.key).toMatch(/\.pdf$/);

      const onDisk = await fs.readFile(result.key);
      expect(onDisk.toString()).toBe('hello world');
    });

    it('rejette un fichier > maxBytes avec file_too_large + cleanup disque', async () => {
      const chunks = [Buffer.alloc(512), Buffer.alloc(512), Buffer.alloc(512)]; // 1536 bytes
      await expect(
        adapter.upload({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          scope: 'deliverables',
          originalName: 'big.bin',
          stream: streamFromChunks(chunks),
          maxBytes: 1024,
        }),
      ).rejects.toThrow('file_too_large');

      // Pas de fichier partiel orphelin
      const dir = path.join(TMP_ROOT, 'projects', ORG_ID, PROJECT_ID, 'deliverables');
      const files = await fs.readdir(dir).catch(() => []);
      expect(files).toHaveLength(0);
    });

    it('rejette un fichier vide avec empty_file', async () => {
      await expect(
        adapter.upload({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          scope: 'deliverables',
          originalName: 'empty.pdf',
          stream: streamFromBuffer(Buffer.alloc(0)),
          maxBytes: 1024,
        }),
      ).rejects.toThrow('empty_file');
    });

    it('rejette extension dangereuse en silencieux (ignore, no ext)', async () => {
      // ext douteuse ⇒ ignorée, fichier stocké sans extension (pas d'exécution possible)
      const result = await adapter.upload({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        scope: 'deliverables',
        originalName: 'evil.sh.exe.<script>',
        stream: streamFromBuffer(Buffer.from('x')),
        maxBytes: 1024,
      });
      expect(path.extname(result.key)).toBe('');
    });

    it('scope quarantine accepté', async () => {
      const result = await adapter.upload({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        scope: 'quarantine',
        originalName: 'infected.bin',
        stream: streamFromBuffer(Buffer.from('eicar')),
        maxBytes: 1024,
      });
      expect(result.key).toContain('quarantine');
    });
  });

  describe('download', () => {
    it('retourne un Readable stream, pas un Buffer', async () => {
      const uploaded = await adapter.upload({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        scope: 'deliverables',
        originalName: 'test.bin',
        stream: streamFromBuffer(Buffer.from('streaming content')),
        maxBytes: 1024,
      });

      const stream = await adapter.download(uploaded.key);
      expect(stream.readable).toBe(true);

      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe('streaming content');
    });

    it('refuse path hors PROJECTS_ROOT (anti-traversal)', async () => {
      // Un appelant malveillant essaie de lire /etc/passwd
      await expect(adapter.download('/etc/passwd')).rejects.toThrow('invalid_path');
      await expect(adapter.download(path.join(TMP_ROOT, '..', 'escape'))).rejects.toThrow('invalid_path');
    });
  });

  describe('delete', () => {
    it('supprime un fichier existant', async () => {
      const uploaded = await adapter.upload({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        scope: 'deliverables',
        originalName: 'to-delete.bin',
        stream: streamFromBuffer(Buffer.from('bye')),
        maxBytes: 1024,
      });
      await adapter.delete(uploaded.key);
      expect(await adapter.exists(uploaded.key)).toBe(false);
    });

    it('est idempotent sur fichier absent', async () => {
      const fakeKey = path.join(TMP_ROOT, 'projects', ORG_ID, PROJECT_ID, 'deliverables', 'absent.bin');
      await expect(adapter.delete(fakeKey)).resolves.toBeUndefined();
    });

    it('refuse delete hors PROJECTS_ROOT', async () => {
      await expect(adapter.delete('/etc/passwd')).rejects.toThrow('invalid_path');
    });
  });

  describe('exists / getMetadata', () => {
    it('exists retourne true pour upload puis delete', async () => {
      const uploaded = await adapter.upload({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        scope: 'deliverables',
        originalName: 'ex.bin',
        stream: streamFromBuffer(Buffer.from('x')),
        maxBytes: 1024,
      });
      expect(await adapter.exists(uploaded.key)).toBe(true);
      await adapter.delete(uploaded.key);
      expect(await adapter.exists(uploaded.key)).toBe(false);
    });

    it('getMetadata retourne la taille correcte', async () => {
      const uploaded = await adapter.upload({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        scope: 'deliverables',
        originalName: 'meta.bin',
        stream: streamFromBuffer(Buffer.from('1234567890')),
        maxBytes: 1024,
      });
      const meta = await adapter.getMetadata(uploaded.key);
      expect(meta.size).toBe(10);
      expect(meta.contentType).toBe('application/octet-stream');
    });
  });

  describe('getSignedUrl', () => {
    it('retourne null (LocalDiskAdapter ne fait pas de signed URL)', async () => {
      const result = await adapter.getSignedUrl?.('any-key', 60);
      expect(result).toBeNull();
    });
  });
});
