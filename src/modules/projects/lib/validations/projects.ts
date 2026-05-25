import { z } from 'zod';

export const PROJECT_TYPES = ['dev', 'refonte', 'migration', 'support', 'autre'] as const;
export const PROJECT_STATUSES = [
  'chiffrage', 'en_cours', 'en_attente', 'recette', 'valide', 'archive',
] as const;

const isoDate = z.string().datetime().optional();

const baseProject = z.object({
  name: z.string().min(1, 'name required').max(255, 'name too long'),
  type: z.enum(PROJECT_TYPES),
  status: z.enum(PROJECT_STATUSES),
  description: z.string().max(5000).optional(),
  started_at: isoDate,
  target_date: isoDate,
});

const refineDateOrder = <T extends { started_at?: string; target_date?: string }>(
  d: T,
): boolean =>
  !d.started_at || !d.target_date || new Date(d.started_at) <= new Date(d.target_date);

const DATE_ORDER_ISSUE: { message: string; path: PropertyKey[] } = {
  message: 'target_date must be >= started_at',
  path: ['target_date'],
};

export const createProjectSchema = baseProject.refine(refineDateOrder, DATE_ORDER_ISSUE);

// Input complet au call site Server Action : ajoute la validation UUID sur
// `organizationId` que la Server Action utilise dans `db.insert`. Évite qu'une
// chaîne vide ou malformée atteigne la FK PostgreSQL (gérée par la DB mais
// jamais proprement loguée comme `invalid_input`).
export const createProjectActionInputSchema = baseProject
  .extend({ organizationId: z.string().uuid() })
  .refine(refineDateOrder, DATE_ORDER_ISSUE);

export const updateProjectSchema = baseProject.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'at least one field required' }
);

export const listProjectsSchema = z.object({
  organizationId: z.string().uuid(),
  status: z.enum(PROJECT_STATUSES).optional(),
  includeDeleted: z.boolean().default(false),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateProjectActionInput = z.infer<typeof createProjectActionInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
// z.input() pour que `includeDeleted` (avec default) reste optionnel au call site.
export type ListProjectsInput = z.input<typeof listProjectsSchema>;
