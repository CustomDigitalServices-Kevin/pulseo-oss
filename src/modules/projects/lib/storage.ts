/**
 * Storage adapter local — écrit les fichiers dans STORAGE_PATH/projects/.
 *
 * Chemin attendu : `<STORAGE_PATH>/projects/<org_id>/<project_id>/<scope>/<uuid>.<ext>`
 * Scope = 'docs' | 'deliverables' (P4).
 *
 * Cette interface est volontairement mince : P4 introduira une abstraction
 * `StorageAdapter` pour permettre S3 plus tard. Pour P2, direct fs.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const STORAGE_ROOT = process.env.STORAGE_PATH || '/opt/pulseo-storage';
const PROJECTS_ROOT = path.join(STORAGE_ROOT, 'projects');

function safeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ext || ext.length > 10 || !/^\.[a-z0-9]+$/.test(ext)) return '';
  return ext;
}

/**
 * Anti-traversal + anti-hidden-files. Le helper core `sanitizeFilename` a un
 * bug connu (accepte `.htaccess`) — on ajoute un check explicite ici.
 */
function sanitizeOriginalName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-]/g, '_');
  if (base.startsWith('.')) return `_${base}`;
  return base.slice(0, 250) || 'file';
}

/**
 * Écrit un fichier dans le storage projet. Retourne le chemin absolu et l'id
 * du fichier. Crée les dossiers intermédiaires si absents.
 */
export async function writeProjectFile(opts: {
  organizationId: string;
  projectId: string;
  scope: 'docs' | 'deliverables';
  originalName: string;
  content: Buffer | Uint8Array;
}): Promise<{ fileId: string; filePath: string; sizeBytes: number }> {
  const fileId = randomUUID();
  const ext = safeExt(opts.originalName);
  const filename = `${fileId}${ext}`;
  const dir = path.join(PROJECTS_ROOT, opts.organizationId, opts.projectId, opts.scope);
  await fs.mkdir(dir, { recursive: true, mode: 0o750 });
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, opts.content, { mode: 0o640 });
  const stat = await fs.stat(filePath);
  return { fileId, filePath, sizeBytes: stat.size };
}

export async function readProjectFile(filePath: string): Promise<Buffer> {
  // Garde contre traversal — file_path doit toujours être sous PROJECTS_ROOT.
  const normalized = path.resolve(filePath);
  if (!normalized.startsWith(path.resolve(PROJECTS_ROOT) + path.sep)) {
    throw new Error('invalid_path');
  }
  return fs.readFile(normalized);
}

export async function deleteProjectFile(filePath: string): Promise<void> {
  const normalized = path.resolve(filePath);
  if (!normalized.startsWith(path.resolve(PROJECTS_ROOT) + path.sep)) {
    throw new Error('invalid_path');
  }
  await fs.unlink(normalized).catch(() => undefined);
}

export { sanitizeOriginalName };
