import { z } from "zod";

export const DOCUMENT_CATEGORIES = [
  "cdc",
  "spec_tech",
  "doc_user",
  "devis",
  "facture",
  "recette",
  "autre",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Taille max par document (20 MB — aligné spec §"Limites de taille"). */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

/** Mimes acceptés : PDF + Office + images courantes. */
export const DOCUMENT_ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

export const uploadDocumentInputSchema = z.object({
  projectId: z.string().uuid(),
  category: z.enum(DOCUMENT_CATEGORIES),
  originalName: z.string().min(1).max(500),
  mimeType: z.string().max(120),
  sizeBytes: z.number().int().min(1).max(DOCUMENT_MAX_BYTES),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentInputSchema>;
