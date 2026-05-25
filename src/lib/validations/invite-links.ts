import { z } from 'zod';

export const createInviteLinkSchema = z.object({
  organization_id: z.string().min(1, 'Organisation requise'),
  label: z.string().max(255).optional(),
  expires_at: z.string().datetime().optional(),
});

export const guestTicketSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  guest_name: z
    .string()
    .min(2, 'Nom minimum 2 caracteres')
    .max(255, 'Nom maximum 255 caracteres'),
  guest_email: z
    .string()
    .email('Email valide requis'),
  title: z
    .string()
    .min(3, 'Titre minimum 3 caracteres')
    .max(200, 'Titre maximum 200 caracteres'),
  description: z
    .string()
    .min(10, 'Description minimum 10 caracteres')
    .max(10000, 'Description maximum 10000 caracteres'),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.enum(['bug', 'feature', 'support', 'maintenance']),
});

export const registerFromInviteSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  name: z
    .string()
    .min(2, 'Nom minimum 2 caracteres')
    .max(255, 'Nom maximum 255 caracteres'),
  email: z
    .string()
    .email('Email valide requis'),
  password: z
    .string()
    .min(8, 'Mot de passe minimum 8 caracteres')
    .max(128, 'Mot de passe maximum 128 caracteres'),
});

export const startInviteSignInSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  email: z.string().email('Email valide requis'),
});

export type CreateInviteLink = z.infer<typeof createInviteLinkSchema>;
export type GuestTicket = z.infer<typeof guestTicketSchema>;
export type RegisterFromInvite = z.infer<typeof registerFromInviteSchema>;
export type StartInviteSignIn = z.infer<typeof startInviteSignInSchema>;
