/**
 * Chiffrement AES-GCM pour les tokens GitHub (P9).
 *
 * Spec §"P9 — GitHub integration (détail différé)" byte layout :
 *   [nonce (12 bytes)] [ciphertext (n bytes)] [authTag (16 bytes)]
 *
 * Rotation : `PROJECTS_ENCRYPTION_KEY` (v1) + `PROJECTS_ENCRYPTION_KEY_V2`
 * (v2) etc. La colonne `key_version` sur `proj_github_tokens` dit quelle
 * clé utiliser au decrypt.
 *
 * Erreur handling : `decryptToken` retourne un Result discriminé au lieu de
 * throw, pour éviter de logger le blob chiffré ou un partial plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { logger } from '@/lib/logger';

const NONCE_LEN = 12;
const AUTH_TAG_LEN = 16;

function getKey(version: number): Buffer {
  const varName = version === 1 ? 'PROJECTS_ENCRYPTION_KEY' : `PROJECTS_ENCRYPTION_KEY_V${version}`;
  const raw = process.env[varName];
  if (!raw) {
    throw new Error(`missing_encryption_key:v${version}`);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`invalid_encryption_key:v${version}: must be 32 raw bytes (base64-encoded)`);
  }
  return key;
}

/**
 * Chiffre un token en plaintext avec AES-256-GCM.
 * Retourne un Buffer : nonce(12) || ciphertext(n) || tag(16).
 */
export function encryptToken(plaintext: string, keyVersion: number): Buffer {
  if (!plaintext) throw new Error('empty_plaintext');
  const key = getKey(keyVersion);
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, authTag]);
}

export type DecryptResult =
  | { ok: true; plaintext: string }
  | { ok: false; error: 'decrypt_failed' };

/**
 * Déchiffre un blob. Retourne un Result — jamais de throw, jamais de log
 * qui leak le blob chiffré ou du partial plaintext (spec §"Erreur handling").
 */
export function decryptToken(blob: Buffer, keyVersion: number): DecryptResult {
  if (blob.length < NONCE_LEN + AUTH_TAG_LEN + 1) {
    return { ok: false, error: 'decrypt_failed' };
  }
  try {
    const key = getKey(keyVersion);
    const nonce = blob.subarray(0, NONCE_LEN);
    const authTag = blob.subarray(blob.length - AUTH_TAG_LEN);
    const ciphertext = blob.subarray(NONCE_LEN, blob.length - AUTH_TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return { ok: true, plaintext };
  } catch (err) {
    // Log sans bytes ni stack — éviter leak
    logger.error('[projects/crypto] decrypt error', {
      key_version: keyVersion,
      blob_length: blob.length,
      error_type: err instanceof Error ? err.name : typeof err,
    });
    return { ok: false, error: 'decrypt_failed' };
  }
}

/**
 * Current key version — lit env `PROJECTS_ENCRYPTION_KEY_VERSION` (default 1).
 * Toutes les nouvelles encryptions utilisent cette version. Les anciennes
 * rows gardent leur `key_version` dans DB.
 */
export function currentKeyVersion(): number {
  const v = Number(process.env.PROJECTS_ENCRYPTION_KEY_VERSION);
  return Number.isInteger(v) && v > 0 ? v : 1;
}
