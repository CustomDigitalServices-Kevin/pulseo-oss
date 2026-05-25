import { z } from 'zod';

export const FEEDBACK_TYPES = ['feature', 'bug'] as const;
export const FEEDBACK_STATUSES = ['new', 'reviewed', 'accepted', 'rejected'] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const createFeedbackSchema = z.object({
  type: z.enum(FEEDBACK_TYPES),
  title: z
    .string()
    .trim()
    .min(3, 'Titre minimum 3 caracteres')
    .max(200, 'Titre maximum 200 caracteres'),
  description: z
    .string()
    .trim()
    .min(10, 'Description minimum 10 caracteres')
    .max(5000, 'Description maximum 5000 caracteres'),
  organization_id: z.string().uuid().optional().nullable(),
});

export const updateFeedbackStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(FEEDBACK_STATUSES),
  admin_notes: z
    .string()
    .trim()
    .max(5000, 'Note admin maximum 5000 caracteres')
    .optional()
    .nullable(),
});

export type CreateFeedback = z.infer<typeof createFeedbackSchema>;
export type CreateFeedbackInput = z.input<typeof createFeedbackSchema>;
export type UpdateFeedbackStatus = z.infer<typeof updateFeedbackStatusSchema>;
