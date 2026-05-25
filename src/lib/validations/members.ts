import { z } from 'zod';

export const addMemberSchema = z.object({
  organization_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['viewer', 'gestionnaire', 'admin']),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const removeMemberSchema = z.object({
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
});
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

export const updateMemberRoleSchema = z.object({
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(['viewer', 'gestionnaire', 'admin']),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((v) => (v === null || v.trim().length === 0 ? null : v.trim()));

export const updateMemberInfoSchema = z.object({
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: optionalString(255).optional(),
  first_name: optionalString(120).optional(),
  last_name: optionalString(120).optional(),
  job_title: optionalString(120).optional(),
});
export type UpdateMemberInfoInput = z.infer<typeof updateMemberInfoSchema>;
