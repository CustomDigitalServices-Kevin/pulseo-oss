import { z } from 'zod';

export const RECIPE_STATUSES = ['a_faire', 'en_cours', 'ok', 'ko', 'bloque'] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

const isoDate = z.string().datetime().optional().nullable();

export const createRecipeTestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1, 'title required').max(500),
  expected_result: z.string().max(5000).optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  due_date: isoDate,
});

export const updateRecipeTestSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  expected_result: z.string().max(5000).nullable().optional(),
  status: z.enum(RECIPE_STATUSES).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: isoDate,
  order_index: z.number().int().min(0).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at least one field required' });

export const changeRecipeStatusSchema = z.object({
  status: z.enum(RECIPE_STATUSES),
  note: z.string().max(2000).optional(),
});

export const addRecipeCommentSchema = z.object({
  note: z.string().min(1, 'note required').max(2000),
});

export type CreateRecipeTestInput = z.infer<typeof createRecipeTestSchema>;
export type UpdateRecipeTestInput = z.infer<typeof updateRecipeTestSchema>;
export type ChangeRecipeStatusInput = z.infer<typeof changeRecipeStatusSchema>;
export type AddRecipeCommentInput = z.infer<typeof addRecipeCommentSchema>;
