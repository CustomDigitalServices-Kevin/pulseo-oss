const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// File-format signatures used by validateMagicBytes. Coverage matches
// ALLOWED_MIMES so renaming a binary to .doc / .docx / .pdf no longer
// bypasses the validator (cf P2-2 audit).
//   - DOC (legacy OLE2 compound file): D0 CF 11 E0 A1 B1 1A E1
//   - DOCX (Office Open XML, ZIP container): 50 4B 03 04 ("PK..")
//   - text/plain has no fixed signature; we accept by MIME alone.
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'application/msword': [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    0x50, 0x4b, 0x03, 0x04,
  ],
};

// Whitelist of MIME types accepted without a magic-bytes signature. Any
// other value would fall through validateMagicBytes' "unknown signature"
// path, so we name it explicitly to make audits trivial.
const NO_SIGNATURE_MIMES: ReadonlySet<string> = new Set(['text/plain']);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateMimeType(mimeType: string): boolean {
  return ALLOWED_MIMES.includes(mimeType);
}

export function validateMagicBytes(
  buffer: Buffer,
  mimeType: string
): boolean {
  const magicBytes = MAGIC_BYTES[mimeType];
  if (!magicBytes) {
    // No signature defined: accept only the explicit whitelist.
    // Otherwise reject — refusing the unknown is safer than blindly
    // trusting Content-Type when the validator's coverage is incomplete.
    return NO_SIGNATURE_MIMES.has(mimeType);
  }

  const fileHeader = buffer.subarray(0, magicBytes.length);
  return magicBytes.every((byte, i) => fileHeader[i] === byte);
}

export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE;
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'file';
}

export async function validateFile(
  file: File
): Promise<{ valid: boolean; error?: string }> {
  if (!validateFileSize(file.size)) {
    return { valid: false, error: 'Fichier trop volumineux (max 10MB)' };
  }

  if (!validateMimeType(file.type)) {
    return { valid: false, error: 'Type de fichier non autorise' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const magicBytesValid = validateMagicBytes(buffer, file.type);
  if (!magicBytesValid) {
    return { valid: false, error: 'Fichier corrompu ou invalide' };
  }

  return { valid: true };
}

// ─── Logo client : whitelist + validation dédiées ──────────────────────────

const LOGO_ALLOWED_MIMES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

export const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2 MB — assez pour un logo HD

export function isLogoMimeAllowed(mimeType: string): boolean {
  return LOGO_ALLOWED_MIMES.has(mimeType);
}

/**
 * Inspecte les premiers bytes d'un buffer pour confirmer le format SVG :
 *  1. décode en UTF-8 les 1024 premiers bytes
 *  2. trim leading whitespace + BOM
 *  3. accepte une déclaration XML optionnelle, puis exige `<svg`
 * Refuse en particulier les binaires arbitraires renommés .svg, et les SVG
 * commençant par `<!ENTITY` (XXE) car la déclaration XML doit être présente
 * en premier si elle existe.
 */
export function validateSvgContent(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 1024).toString('utf8');
  // Strip BOM + whitespace
  const trimmed = head.replace(/^﻿/, '').trimStart();
  // Accept optional XML prolog before <svg
  if (trimmed.startsWith('<?xml')) {
    const after = trimmed.slice(trimmed.indexOf('?>') + 2).trimStart();
    return after.startsWith('<svg');
  }
  return trimmed.startsWith('<svg');
}

export interface ValidatedLogo {
  valid: true;
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
  buffer: Buffer;
  /** SVG-only : contenu UTF-8 du fichier, à passer à sanitizeSvg. */
  svgText?: string;
}

export type LogoValidationResult = ValidatedLogo | { valid: false; error: string };

/**
 * Valide un logo client uploadé. Retourne le buffer + MIME normalisé, ou une
 * erreur lisible. Le SVG est validé par contenu (pas magic-bytes), les
 * bitmaps par leurs signatures connues.
 */
export async function validateLogoFile(file: File): Promise<LogoValidationResult> {
  if (file.size > LOGO_MAX_SIZE) {
    return { valid: false, error: 'Logo trop volumineux (max 2 Mo)' };
  }
  if (!isLogoMimeAllowed(file.type)) {
    return {
      valid: false,
      error: "Format non autorisé (PNG, JPEG, WebP ou SVG uniquement)",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === 'image/svg+xml') {
    if (!validateSvgContent(buffer)) {
      return { valid: false, error: 'Fichier SVG invalide' };
    }
    return {
      valid: true,
      mime: 'image/svg+xml',
      buffer,
      svgText: buffer.toString('utf8'),
    };
  }

  const ok = validateMagicBytes(buffer, file.type);
  if (!ok) {
    return { valid: false, error: 'Logo corrompu ou type incorrect' };
  }
  return {
    valid: true,
    mime: file.type as ValidatedLogo['mime'],
    buffer,
  };
}
