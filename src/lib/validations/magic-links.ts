import { z } from 'zod';

export const createMagicLinkSchema = z.object({
  email: z.string().email('Email valide requis'),
  organization_id: z.string().min(1, 'Organisation requise'),
});

export type CreateMagicLink = z.infer<typeof createMagicLinkSchema>;
