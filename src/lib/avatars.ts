import path from 'node:path';
import { mkdir, stat, writeFile, unlink } from 'node:fs/promises';
import sharp from 'sharp';

/**
 * Storage d'avatars utilisateur (A.2).
 *
 * Racine : `PULSEO_DATA_DIR/avatars/` (env var) ou fallback `./data/avatars`
 * à la racine du repo. JAMAIS sous `public/` pour éviter que Next.js serve
 * un fichier uploadé comme statique sans contrôle (path traversal, content
 * sniffing, header manipulation). Les fichiers sont servis via la route API
 * `/api/avatars/[userId]` qui applique Content-Type, X-Content-Type-Options
 * et Cache-Control explicitement.
 */

const AVATAR_SUBDIR = 'avatars';
const AVATAR_DIM = 256;
const AVATAR_FORMAT = 'webp';
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Retourne le dossier absolu où les avatars sont stockés. Crée le dossier
 * au passage si absent (idempotent).
 */
export async function getAvatarsDir(): Promise<string> {
  const base = process.env.PULSEO_DATA_DIR ?? path.join(process.cwd(), 'data');
  const dir = path.join(base, AVATAR_SUBDIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Chemin absolu du fichier avatar pour un user donné. `userId` DOIT provenir
 * de la session auth, pas d'un paramètre user-controlled (anti path traversal).
 * Le basename est construit uniquement depuis un userId qui est un UUID opaque
 * côté Better Auth, donc sans séparateur de chemin possible.
 */
export function avatarPathFor(userId: string, dir: string): string {
  const safeId = userId.replace(/[^a-zA-Z0-9-]/g, '');
  if (safeId.length === 0 || safeId !== userId) {
    throw new Error('Invalid userId shape for avatar path');
  }
  return path.join(dir, `${safeId}.${AVATAR_FORMAT}`);
}

/**
 * Magic bytes des formats d'image supportés en entrée. Validation explicite
 * avant sharp pour rejeter un fichier .php avec header PNG truqué, un SVG
 * malveillant (XSS), etc.
 */
const MAGIC_BYTES: Array<{ name: string; bytes: number[] }> = [
  { name: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { name: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // 'RIFF' puis 'WEBP' à l'offset 8
  { name: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

function detectImageMagic(buf: Buffer): string | null {
  for (const fmt of MAGIC_BYTES) {
    if (buf.length < fmt.bytes.length) continue;
    let ok = true;
    for (let i = 0; i < fmt.bytes.length; i++) {
      if (buf[i] !== fmt.bytes[i]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      // Pour webp, vérifier aussi les bytes 8..11 = 'WEBP'
      if (fmt.name === 'webp') {
        const w = buf.subarray(8, 12).toString('ascii');
        if (w !== 'WEBP') continue;
      }
      return fmt.name;
    }
  }
  return null;
}

export type UploadAvatarResult =
  | { ok: true; bytes: number }
  | { ok: false; error: 'too_large' | 'not_an_image' | 'processing_failed'; detail?: string };

/**
 * Persiste un avatar depuis un Buffer vérifié + resize sharp 256×256 WebP.
 *
 * Ordre anti-DoS + anti-sniffing :
 *  1. Vérifie taille <= 2MB AVANT traitement
 *  2. Valide magic bytes image connus
 *  3. Délègue à sharp qui re-valide et throw si buffer corrompu
 *  4. Resize cover + convert webp quality 82
 *  5. Écrit atomiquement via rename (tmp → final)
 */
export async function saveAvatarFromBuffer(
  userId: string,
  buf: Buffer,
): Promise<UploadAvatarResult> {
  if (buf.length === 0) return { ok: false, error: 'not_an_image', detail: 'empty' };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' };
  const magic = detectImageMagic(buf);
  if (!magic) return { ok: false, error: 'not_an_image', detail: 'bad_magic' };

  try {
    const resized = await sharp(buf)
      .rotate() // respecte EXIF orientation avant crop
      .resize(AVATAR_DIM, AVATAR_DIM, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();

    const dir = await getAvatarsDir();
    const final = avatarPathFor(userId, dir);
    const tmp = `${final}.tmp`;
    await writeFile(tmp, resized);
    // Sur Windows, rename overwrite peut échouer si target existe. Delete
    // d'abord. Sur POSIX, writeFile suivi de rename est atomique.
    try {
      await unlink(final);
    } catch {
      /* fichier absent = premier upload */
    }
    // Renommer tmp → final
    const { rename } = await import('node:fs/promises');
    await rename(tmp, final);
    return { ok: true, bytes: resized.length };
  } catch (err) {
    return {
      ok: false,
      error: 'processing_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Retourne le chemin de l'avatar si le fichier existe, sinon null. Utilisé
 * par la route `/api/avatars/[userId]` pour servir ou répondre 404.
 */
export async function findAvatar(userId: string): Promise<string | null> {
  try {
    const dir = await getAvatarsDir();
    const p = avatarPathFor(userId, dir);
    const s = await stat(p);
    if (!s.isFile()) return null;
    return p;
  } catch {
    return null;
  }
}

export const AVATAR_MAX_BYTES = MAX_UPLOAD_BYTES;
export const AVATAR_SIDE = AVATAR_DIM;
