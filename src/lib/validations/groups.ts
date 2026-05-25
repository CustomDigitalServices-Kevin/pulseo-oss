import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Format slug invalide (minuscules, chiffres, tirets)'),
  logo_url: z.string().url().nullish(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = createGroupSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const attachOrgSchema = z.object({
  organization_id: z.string().uuid(),
  group_id: z.string().uuid().nullable(),
});
export type AttachOrgInput = z.infer<typeof attachOrgSchema>;

export const addGroupManagerSchema = z.object({
  group_id: z.string().uuid(),
  user_id: z.string().uuid(),
});
export type AddGroupManagerInput = z.infer<typeof addGroupManagerSchema>;

export const removeGroupManagerSchema = z.object({
  group_id: z.string().uuid(),
  user_id: z.string().uuid(),
});
export type RemoveGroupManagerInput = z.infer<typeof removeGroupManagerSchema>;
