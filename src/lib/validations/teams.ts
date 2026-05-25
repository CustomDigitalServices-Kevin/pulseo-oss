import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Format slug invalide (minuscules, chiffres, tirets)'),
  description: z.string().max(1000).nullish(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const addTeamMemberSchema = z.object({
  team_id: z.string().uuid(),
  email: z.string().email(),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const removeTeamMemberSchema = z.object({
  team_id: z.string().uuid(),
  user_id: z.string().uuid(),
});
export type RemoveTeamMemberInput = z.infer<typeof removeTeamMemberSchema>;

export const grantTeamOrgSchema = z.object({
  team_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  role: z.enum(['viewer', 'gestionnaire', 'admin']),
});
export type GrantTeamOrgInput = z.infer<typeof grantTeamOrgSchema>;

export const revokeTeamOrgSchema = z.object({
  team_id: z.string().uuid(),
  organization_id: z.string().uuid(),
});
export type RevokeTeamOrgInput = z.infer<typeof revokeTeamOrgSchema>;
