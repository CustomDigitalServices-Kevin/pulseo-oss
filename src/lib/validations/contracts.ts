import { z } from 'zod';

export const createContractSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Nom minimum 3 caracteres')
      .max(200, 'Nom maximum 200 caracteres'),
    organization_id: z.string().uuid(),
    description: z.string().max(5000).optional().nullable(),
    quota_hours: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Quota invalide')
      .transform((v) => v),
    rate_per_hour: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Taux invalide')
      .transform((v) => v),
    sla_response_hours: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .optional()
      .nullable(),
    sla_resolution_hours: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .optional()
      .nullable(),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
  })
  .refine((data) => data.end_date > data.start_date, {
    message: 'La date de fin doit etre apres la date de debut',
    path: ['end_date'],
  });

export const updateContractSchema = z.object({
  name: z
    .string()
    .min(3, 'Nom minimum 3 caracteres')
    .max(200, 'Nom maximum 200 caracteres')
    .optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['active', 'expired', 'terminated']).optional(),
  quota_hours: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Quota invalide')
    .optional(),
  rate_per_hour: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Taux invalide')
    .optional(),
  sla_response_hours: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .nullable(),
  sla_resolution_hours: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .nullable(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

export const terminateContractSchema = z.object({
  contract_id: z.string().uuid(),
});

export type CreateContract = z.infer<typeof createContractSchema>;
export type UpdateContract = z.infer<typeof updateContractSchema>;
export type TerminateContract = z.infer<typeof terminateContractSchema>;
