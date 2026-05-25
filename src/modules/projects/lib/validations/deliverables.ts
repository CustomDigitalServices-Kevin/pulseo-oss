import { z } from 'zod';

/**
 * Kinds de livrable — `file` (upload disk) ou `github_repo` (P9).
 * P4a accepte les deux côté DB mais seul `file` a une implémentation.
 */
export const DELIVERABLE_KINDS = ['file', 'github_repo'] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

/**
 * Limites taille par type de livrable fichier — alignées spec §"Limites de
 * taille par type de fichier". Utilisées pour le check maxBytes streaming.
 */
export const DELIVERABLE_SIZE_LIMITS = {
  pdf: 50 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  office: 50 * 1024 * 1024,
  msapp: 50 * 1024 * 1024,
  flow: 10 * 1024 * 1024,
  pbix: 200 * 1024 * 1024,
  solution: 500 * 1024 * 1024,
  other: 50 * 1024 * 1024,
} as const;

export type DeliverableFileCategory = keyof typeof DELIVERABLE_SIZE_LIMITS;

/**
 * Mime → catégorie taille. Utilisé côté upload pour déterminer la limite à
 * appliquer. Les mimes inconnus tombent sur `other` (50 MB — limite
 * conservative P4a ; P5+ élargira via feature flags).
 */
const MIME_TO_CATEGORY: Record<string, DeliverableFileCategory> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'application/msword': 'office',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'office',
  'application/vnd.ms-excel': 'office',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'office',
  'application/vnd.ms-powerpoint': 'office',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'office',
  // MSAPP exportés sont des ZIP — détection par extension côté upload
  'application/zip': 'solution', // conservative : on ne sait pas si MSAPP/Flow/Solution
  'application/x-zip-compressed': 'solution',
};

const EXT_TO_CATEGORY: Record<string, DeliverableFileCategory> = {
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.docx': 'office',
  '.doc': 'office',
  '.xlsx': 'office',
  '.xls': 'office',
  '.pptx': 'office',
  '.ppt': 'office',
  '.msapp': 'msapp',
  '.pbix': 'pbix',
  '.zip': 'solution',
};

/**
 * Détermine la catégorie (et donc la limite taille) à partir du mime + extension.
 * L'extension prime sur le mime (les MSAPP ont un mime ZIP générique).
 */
export function categorizeDeliverable(
  originalName: string,
  mimeType: string,
): DeliverableFileCategory {
  const lowerName = originalName.toLowerCase();
  for (const ext of Object.keys(EXT_TO_CATEGORY)) {
    if (lowerName.endsWith(ext)) return EXT_TO_CATEGORY[ext];
  }
  return MIME_TO_CATEGORY[mimeType] || 'other';
}

/** Mimes autorisés en upload livrable fichier. */
export const DELIVERABLE_ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream', // fallback MSAPP/PBIX qui peuvent arriver sans mime précis
]);

/**
 * Version d'un livrable — format semver-ish light : `[major].[minor]`,
 * optionnellement `[major].[minor].[patch]`. Permet `1.0`, `2.1.3`, etc.
 * Pas de suffixes (`1.0-beta` non supportés pour MVP).
 */
export const VERSION_REGEX = /^\d{1,4}\.\d{1,4}(\.\d{1,4})?$/;

// ─── Schemas ──────────────────────────────────────────────────────────────────

/**
 * Metadata envoyé avec l'upload stream. Les bytes du fichier eux-mêmes
 * arrivent via `req.body` (ReadableStream), pas dans ce schema.
 */
export const uploadDeliverableMetaSchema = z.object({
  projectId: z.string().uuid(),
  version: z.string().regex(VERSION_REGEX, 'version must match N.N or N.N.N'),
  originalName: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
  markAsLatest: z.boolean().default(true),
});

export type UploadDeliverableMeta = z.input<typeof uploadDeliverableMetaSchema>;

export const promoteVersionInputSchema = z.object({
  deliverableId: z.string().uuid(),
});

export const softDeleteDeliverableInputSchema = z.object({
  deliverableId: z.string().uuid(),
});

export const listDeliverablesInputSchema = z.object({
  projectId: z.string().uuid(),
  includeDeleted: z.boolean().default(false),
});

export type ListDeliverablesInput = z.input<typeof listDeliverablesInputSchema>;
