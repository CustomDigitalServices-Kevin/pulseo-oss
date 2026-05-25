import { z } from 'zod';

export const createCommentSchema = z.object({
  ticket_id: z.string().uuid(),
  content: z
    .string()
    .min(1, 'Commentaire requis')
    .max(5000, 'Commentaire max 5000 caracteres'),
  is_internal: z.boolean().default(false),
});

export type CreateComment = z.infer<typeof createCommentSchema>;
