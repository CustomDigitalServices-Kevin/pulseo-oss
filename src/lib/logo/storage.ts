import path from 'node:path';
import { mkdir, stat, unlink, readdir } from 'node:fs/promises';

const LOGO_SUBDIR = 'logos';

/**
 * Mapping MIME → extension de fichier physique. Le MIME stocké en DB sert de
 * source de vérité pour le Content-Type au GET ; l'extension est uniquement
 * un détail de stockage disque.
 */
export const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/**
 * Racine de stockage des logos client. JAMAIS sous `public/` pour les mêmes
 * raisons que les avatars : éviter de servir un fichier uploadé comme actif
 * statique sans contrôle Content-Type / nosniff.
 */
export async function getLogosDir(): Promise<string> {
  const base = process.env.PULSEO_DATA_DIR ?? path.join(process.cwd(), 'data');
  const dir = path.join(base, LOGO_SUBDIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

function safeOrgId(orgId: string): string {
  // UUID v4 strict — anti path traversal absolu.
  const cleaned = orgId.replace(/[^a-zA-Z0-9-]/g, '');
  if (cleaned !== orgId || cleaned.length === 0) {
    throw new Error('Invalid orgId shape for logo path');
  }
  return cleaned;
}

export function logoPathFor(orgId: string, dir: string, ext: string): string {
  const safe = safeOrgId(orgId);
  // ext déjà whitelistée via MIME_TO_EXT côté upload
  return path.join(dir, `${safe}.${ext}`);
}

/**
 * Cherche le fichier logo existant pour un org sur disque. Comme on accepte
 * 4 extensions possibles et qu'on ne veut pas faire confiance à `logo_mime`
 * en DB pour le path (drift possible), on liste le dossier et on filtre.
 * Retourne le chemin absolu ou null.
 */
export async function findLogo(orgId: string): Promise<{ path: string; ext: string } | null> {
  const safe = safeOrgId(orgId);
  const dir = await getLogosDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const prefix = `${safe}.`;
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const ext = entry.slice(prefix.length);
    if (!Object.values(MIME_TO_EXT).includes(ext)) continue;
    const fullPath = path.join(dir, entry);
    try {
      const s = await stat(fullPath);
      if (s.isFile()) return { path: fullPath, ext };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Supprime tout fichier logo existant pour cet org (toutes extensions). Idem-
 * potent : pas d'erreur si aucun fichier.
 */
export async function deleteAllLogosFor(orgId: string): Promise<void> {
  const safe = safeOrgId(orgId);
  const dir = await getLogosDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const prefix = `${safe}.`;
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const fullPath = path.join(dir, entry);
    try {
      await unlink(fullPath);
    } catch {
      // ignore
    }
  }
}
