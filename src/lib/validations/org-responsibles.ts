import { z } from 'zod';

export const addResponsibleSchema = z.object({
  organization_id: z.string().uuid('Organisation invalide'),
  email: z.string().email('Email invalide').max(255),
  name: z
    .string()
    .max(255, 'Nom max 255 caractères')
    .optional()
    .or(z.literal('')),
});

export type AddResponsible = z.infer<typeof addResponsibleSchema>;

export const updateResponsibleSchema = z.object({
  responsible_id: z.string().uuid('Identifiant invalide'),
  email: z.string().email('Email invalide').max(255),
  name: z
    .string()
    .max(255, 'Nom max 255 caractères')
    .nullable()
    .transform((v) => (v === null || v.trim().length === 0 ? null : v.trim())),
});
export type UpdateResponsibleInput = z.infer<typeof updateResponsibleSchema>;

export const updateOrgLeadSchema = z.object({
  organization_id: z.string().uuid('Organisation invalide'),
  email: z.string().email('Email invalide').max(255).nullable(),
  name: z
    .string()
    .max(255, 'Nom max 255 caractères')
    .nullable()
    .transform((v) => (v === null || v.trim().length === 0 ? null : v.trim())),
});
export type UpdateOrgLeadInput = z.infer<typeof updateOrgLeadSchema>;
