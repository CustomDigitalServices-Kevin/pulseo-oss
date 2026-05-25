import { z } from 'zod';

export const requestAccountDeletionSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(2000, 'Le motif est limité à 2000 caractères')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type RequestAccountDeletion = z.infer<typeof requestAccountDeletionSchema>;
