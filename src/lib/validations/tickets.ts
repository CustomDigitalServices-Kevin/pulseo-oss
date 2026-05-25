import { z } from 'zod';

const tagSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'Tag invalide (a-z, 0-9, tirets uniquement)')
  .min(1)
  .max(32);

/**
 * Scenario step schema V2 — backward-compatible avec V1 `{index, text}`.
 * Nouveaux champs tous optionnels :
 *  - `comment` : note longue Markdown (rendu SafeMarkdown côté UI, max 5000
 *    caractères pour cap payload jsonb)
 *  - `condition` : discriminated union (seul `type: 'if'` pour MVP). Step
 *    porteur d'une bifurcation logique. `logic` = 'and' | 'or' pour cumul
 *    d'expressions. `true_next` et `false_next` pointent sur des indices
 *    d'étapes du même array (pas des positions, des `step.index`), ce qui
 *    permet de rejoindre un step commun après branching (merge-after-if).
 *
 * Les tickets existants V1 passent le schema sans migration SQL (jsonb
 * accepte les deux shapes, champs absents = step linéaire).
 */
const scenarioConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('if'),
    expression: z
      .string()
      .min(1, 'Expression requise')
      .max(500, 'Expression maximum 500 caracteres'),
    logic: z.enum(['and', 'or']).optional(),
    true_next: z.number().int().min(1).max(50).optional().nullable(),
    false_next: z.number().int().min(1).max(50).optional().nullable(),
  }),
]);

const scenarioStepSchema = z.object({
  index: z.number().int().min(1).max(50),
  text: z
    .string()
    .min(1, 'Etape vide')
    .max(500, 'Etape maximum 500 caracteres'),
  comment: z
    .string()
    .max(5000, 'Commentaire maximum 5000 caracteres')
    .optional()
    .nullable(),
  condition: scenarioConditionSchema.optional().nullable(),
  /**
   * Index du step qui précède celui-ci dans le flow. Optionnel : si absent,
   * le step suit l'ordre linéaire (index-1). Requis pour placer une étape
   * dans une branche SI ou SINON spécifique d'un step conditionnel amont.
   *
   * La cohérence (pas d'auto-ref, parent existe dans l'array) est validée
   * au niveau array via `.refine()`.
   */
  parent_index: z.number().int().min(1).max(50).optional().nullable(),
});

/**
 * Valide l'array `scenario_steps` au-delà de chaque item :
 *  - index uniques sur le tableau
 *  - refs `true_next` / `false_next` pointent sur un `index` existant
 *  - pas d'auto-référence (step qui pointe sur lui-même via condition)
 * Les cycles multi-niveaux ne sont pas détectés pour MVP (conditions
 * imbriquées hors scope — un seul niveau de branching supporté).
 */
const scenarioStepsArraySchema = z
  .array(scenarioStepSchema)
  .max(20, 'Maximum 20 etapes')
  .refine(
    (steps) => new Set(steps.map((s) => s.index)).size === steps.length,
    { message: 'Index d etape dupliques' },
  )
  .refine(
    (steps) => {
      const known = new Set(steps.map((s) => s.index));
      for (const s of steps) {
        const c = s.condition;
        if (c && c.type === 'if') {
          if (c.true_next != null && !known.has(c.true_next)) return false;
          if (c.false_next != null && !known.has(c.false_next)) return false;
          if (c.true_next === s.index || c.false_next === s.index) return false;
        }
        if (s.parent_index != null) {
          if (!known.has(s.parent_index)) return false;
          if (s.parent_index === s.index) return false;
        }
      }
      return true;
    },
    { message: 'Reference invalide (branche ou etape precedente inconnue ou auto-reference)' },
  );

export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
export type ScenarioCondition = z.infer<typeof scenarioConditionSchema>;

export const createTicketSchema = z.object({
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
  contract_id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  tags: z.array(tagSchema).max(10, 'Maximum 10 tags').optional(),
  location: z
    .string()
    .max(200, 'Localisation maximum 200 caracteres')
    .optional()
    .nullable(),
  scenario_steps: scenarioStepsArraySchema.optional().nullable(),
});

export const updateTicketTagsSchema = z.object({
  ticket_id: z.string().uuid(),
  tags: z.array(tagSchema).max(10, 'Maximum 10 tags'),
});

export const bulkUpdateTicketStatusSchema = z.object({
  ticket_ids: z
    .array(z.string().uuid())
    .min(1, 'Au moins un ticket requis')
    .max(100, 'Maximum 100 tickets par lot'),
  status: z.enum(['new', 'in_progress', 'waiting_client', 'resolved', 'closed']),
});

export const updateTicketSchema = z.object({
  title: z
    .string()
    .min(3, 'Titre minimum 3 caracteres')
    .max(200, 'Titre maximum 200 caracteres')
    .optional(),
  description: z
    .string()
    .min(10, 'Description minimum 10 caracteres')
    .max(10000, 'Description maximum 10000 caracteres')
    .optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.enum(['bug', 'feature', 'support', 'maintenance']).optional(),
  contract_id: z.string().uuid().optional().nullable(),
  location: z
    .string()
    .max(200, 'Localisation maximum 200 caracteres')
    .optional()
    .nullable(),
  scenario_steps: scenarioStepsArraySchema.optional().nullable(),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['new', 'in_progress', 'waiting_client', 'resolved', 'closed']),
  ticket_id: z.string().uuid(),
  notify_by_email: z.boolean().optional(),
});

export const assignContractSchema = z.object({
  ticket_id: z.string().uuid(),
  contract_id: z.string().uuid(),
});

export const updateTimeSpentSchema = z.object({
  ticket_id: z.string().uuid(),
  time_spent_minutes: z
    .number()
    .int('Doit etre un entier')
    .min(0, 'Doit etre positif')
    .max(10000, 'Maximum 10000 minutes'),
});

export type CreateTicket = z.infer<typeof createTicketSchema>;
export type UpdateTicket = z.infer<typeof updateTicketSchema>;
export type UpdateTicketStatus = z.infer<typeof updateTicketStatusSchema>;
export type AssignContract = z.infer<typeof assignContractSchema>;
export type UpdateTimeSpent = z.infer<typeof updateTimeSpentSchema>;
export type UpdateTicketTags = z.infer<typeof updateTicketTagsSchema>;
export type BulkUpdateTicketStatus = z.infer<typeof bulkUpdateTicketStatusSchema>;
