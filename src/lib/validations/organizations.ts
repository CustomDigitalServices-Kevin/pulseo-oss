import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string()
    .min(2, 'Nom minimum 2 caractères')
    .max(255, 'Nom maximum 255 caractères'),
  slug: z.string()
    .min(2, 'Slug minimum 2 caractères')
    .max(100, 'Slug maximum 100 caractères')
    .regex(/^[a-z0-9-]+$/, 'Slug alphanumérique + tirets uniquement'),
  description: z.string().max(500, 'Description max 500 caractères').optional(),
  color_primary: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex valide (#RRGGBB)')
    .default('#2563EB'),
  color_secondary: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex valide (#RRGGBB)')
    .default('#1E40AF'),
  qonto_client_email: z.string().email('Email Qonto valide').optional().or(z.literal('')),
  responsible_email: z.string().email('Email responsable invalide').optional().or(z.literal('')),
  responsible_name: z.string().max(255, 'Nom max 255 caractères').optional().or(z.literal('')),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

export type CreateOrganization = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
