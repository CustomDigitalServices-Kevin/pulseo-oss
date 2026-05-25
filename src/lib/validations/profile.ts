import { z } from 'zod';

/**
 * Validations Zod pour les server actions de profil utilisateur (A.2).
 * Tous les champs nullables mappent à `null` (pas `undefined`) pour
 * expliciter le reset côté DB.
 */

export const updateProfileSchema = z.object({
  first_name: z
    .string()
    .trim()
    .max(120, 'Prenom maximum 120 caracteres')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  last_name: z
    .string()
    .trim()
    .max(120, 'Nom maximum 120 caracteres')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  job_title: z
    .string()
    .trim()
    .max(120, 'Poste maximum 120 caracteres')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const updateEmailSchema = z.object({
  newEmail: z.string().email('Email invalide').max(255),
});

/**
 * Password min 8 caracteres, au moins une lettre + un chiffre. Cohérent avec
 * la politique Better Auth par défaut mais un peu plus stricte côté Pulseo.
 */
export const setPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Mot de passe minimum 8 caracteres')
    .max(128, 'Mot de passe maximum 128 caracteres')
    .regex(/[A-Za-z]/, 'Doit contenir au moins une lettre')
    .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
  currentPassword: z.string().min(1).optional(),
});

export const updateLocaleSchema = z.object({
  locale: z.enum(['fr', 'en']),
});

export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateEmail = z.infer<typeof updateEmailSchema>;
export type SetPassword = z.infer<typeof setPasswordSchema>;
export type UpdateLocale = z.infer<typeof updateLocaleSchema>;

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
