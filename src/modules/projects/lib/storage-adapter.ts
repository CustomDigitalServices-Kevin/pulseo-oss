/**
 * StorageAdapter — abstraction storage pour le module Projets.
 *
 * Contract streaming : upload/download prennent/retournent des Readable
 * streams. Pas de buffer mémoire pour les gros livrables (PBIX 200MB, Solution
 * 500MB). Cf spec §"StorageAdapter interface" lignes 452-473.
 *
 * Implementation P4a : LocalDiskAdapter (disk local). R2Adapter/S3Adapter
 * post-MVP, sans breaking change grâce à l'interface.
 *
 * Gotcha P2 (documents.ts) : le code P2 utilise `writeProjectFile` qui buffer
 * en mémoire. P4a introduit le StorageAdapter pour les deliverables SEULEMENT.
 * Migration de documents vers StorageAdapter = P4d (évite surface de bug).
 */
import { promises as fs, createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

export interface StorageAdapter {
  /**
   * Écrit un stream dans le storage. Retourne une clé opaque (chemin absolu
   * pour LocalDiskAdapter, URL s3:// pour S3Adapter post-MVP).
   *
   * @param opts.scope segment "docs" | "deliverables" | "quarantine"
   * @param opts.originalName nom original (pour extension uniquement, déjà sanitized)
   * @param opts.stream contenu Readable — NE DOIT PAS être buffered par l'adapter
   * @param opts.maxBytes limite taille ; si dépassée, abort stream + throw `file_too_large`
   * @returns `{ key, sizeBytes }` — key = chemin absolu pour LocalDiskAdapter
   */
  upload(opts: {
    organizationId: string;
    projectId: string;
    scope: 'deliverables' | 'docs' | 'quarantine';
    originalName: string;
    stream: Readable;
    maxBytes: number;
  }): Promise<{ key: string; sizeBytes: number }>;

  /**
   * Ouvre un Readable stream pour download. NE DOIT PAS fs.readFile()
   * (buffer tout). Permet Content-Length header + ranged reads pour PDF.js.
   */
  download(key: string): Promise<Readable>;

  /** Supprime le fichier. Idempotent — pas d'erreur si déjà absent. */
  delete(key: string): Promise<void>;

  /** Check présence sans lire le contenu. */
  exists(key: string): Promise<boolean>;

  /** Size + content-type pour headers HTTP. */
  getMetadata(key: string): Promise<{ size: number; contentType: string }>;

  /**
   * URL signée (R2/S3). LocalDiskAdapter retourne null — fallback proxy
   * download côté route API.
   */
  getSignedUrl?(key: string, expiresInSeconds: number): Promise<string | null>;
}

// ─── LocalDiskAdapter ─────────────────────────────────────────────────────────

const STORAGE_ROOT = process.env.STORAGE_PATH || '/opt/pulseo-storage';
const PROJECTS_ROOT = path.join(STORAGE_ROOT, 'projects');

function safeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ext || ext.length > 10 || !/^\.[a-z0-9]+$/.test(ext)) return '';
  return ext;
}

function guardPath(key: string): string {
  const normalized = path.resolve(key);
  const root = path.resolve(PROJECTS_ROOT);
  if (!normalized.startsWith(root + path.sep)) {
    throw new Error('invalid_path');
  }
  return normalized;
}

export class LocalDiskAdapter implements StorageAdapter {
  async upload(opts: {
    organizationId: string;
    projectId: string;
    scope: 'deliverables' | 'docs' | 'quarantine';
    originalName: string;
    stream: Readable;
    maxBytes: number;
  }): Promise<{ key: string; sizeBytes: number }> {
    const fileId = randomUUID();
    const ext = safeExt(opts.originalName);
    const filename = `${fileId}${ext}`;
    const dir = path.join(PROJECTS_ROOT, opts.organizationId, opts.projectId, opts.scope);
    await fs.mkdir(dir, { recursive: true, mode: 0o750 });
    const filePath = path.join(dir, filename);

    // Counter + early abort si dépasse maxBytes pendant le pipe.
    // Gotcha: check taille AU STREAM, pas après — sinon 500MB sur
    // disque avant reject.
    let bytesWritten = 0;
    const writeStream = createWriteStream(filePath, { mode: 0o640 });
    let overLimit = false;
    opts.stream.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length;
      if (bytesWritten > opts.maxBytes && !overLimit) {
        overLimit = true;
        opts.stream.destroy(new Error('file_too_large'));
        writeStream.destroy();
      }
    });

    try {
      await pipeline(opts.stream, writeStream);
    } catch (err) {
      // Cleanup partial write
      await fs.unlink(filePath).catch(() => undefined);
      if (overLimit || (err instanceof Error && err.message === 'file_too_large')) {
        throw new Error('file_too_large');
      }
      logger.error('[storage/upload] pipeline failed', { err: String(err), filePath });
      throw new Error('storage_error');
    }

    const stat = await fs.stat(filePath);
    if (stat.size === 0) {
      await fs.unlink(filePath).catch(() => undefined);
      throw new Error('empty_file');
    }
    return { key: filePath, sizeBytes: stat.size };
  }

  async download(key: string): Promise<Readable> {
    const normalized = guardPath(key);
    return createReadStream(normalized);
  }

  async delete(key: string): Promise<void> {
    const normalized = guardPath(key);
    await fs.unlink(normalized).catch(() => undefined);
  }

  async exists(key: string): Promise<boolean> {
    try {
      const normalized = guardPath(key);
      await fs.access(normalized);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<{ size: number; contentType: string }> {
    const normalized = guardPath(key);
    const stat = await fs.stat(normalized);
    // contentType déduit par l'appelant via mime_type DB, pas via filesystem
    return { size: stat.size, contentType: 'application/octet-stream' };
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    void key;
    void expiresInSeconds;
    return null;
  }
}

// Singleton — permet aux tests de mock via vi.mock('@/modules/projects/lib/storage-adapter')
let _adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (!_adapter) _adapter = new LocalDiskAdapter();
  return _adapter;
}

/**
 * Reset (tests only).
 */
export function resetStorageAdapter(): void {
  _adapter = null;
}
