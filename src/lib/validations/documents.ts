import { z } from 'zod';

export const uploadDocumentSchema = z.object({
  title: z
    .string()
    .min(3, 'Titre minimum 3 caracteres')
    .max(200, 'Titre maximum 200 caracteres'),
  type: z.enum(['invoice', 'quote', 'report', 'other']),
  organization_id: z.string().uuid(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Montant invalide')
    .optional()
    .nullable(),
  issued_at: z.coerce.date().optional().nullable(),
});

export type UploadDocument = z.infer<typeof uploadDocumentSchema>;
