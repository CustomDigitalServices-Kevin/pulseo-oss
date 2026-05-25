/**
 * Schema Zod pour preview_annotation (spec §"Zod schema preview_annotation").
 *
 * Les identifiants sont rendus dans SVG, React Flow, tooltips → vecteur XSS
 * potentiel. Regex stricte obligatoire sur tout idString.
 */
import { z } from 'zod';

const idString = z.string().regex(/^[a-zA-Z0-9_\-.]{1,128}$/);
const safeCoord = z.number().finite().min(0).max(10000);
const bboxSchema = z.object({
  x: safeCoord,
  y: safeCoord,
  w: safeCoord,
  h: safeCoord,
});
const rectSchema = bboxSchema;
const pageNumber = z.number().int().min(1).max(9999);

export const previewAnnotationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('msapp'),
    deliverable_id: z.string().uuid(),
    screen_id: idString,
    control_id: idString.optional(),
    bbox: bboxSchema,
  }),
  z.object({
    type: z.literal('pbix'),
    deliverable_id: z.string().uuid(),
    page_id: idString,
    visual_id: idString.optional(),
    bbox: bboxSchema,
  }),
  z.object({
    type: z.literal('flow'),
    deliverable_id: z.string().uuid(),
    node_id: idString,
  }),
  z.object({
    type: z.literal('solution'),
    deliverable_id: z.string().uuid(),
    component_type: idString,
    component_id: idString,
  }),
  z.object({
    type: z.literal('pdf'),
    deliverable_id: z.string().uuid(),
    page: pageNumber,
    rect: rectSchema,
  }),
  z.object({
    type: z.literal('image'),
    deliverable_id: z.string().uuid(),
    rect: rectSchema,
  }),
]);

export type PreviewAnnotation = z.infer<typeof previewAnnotationSchema>;

/**
 * Input Server Action createTicketLinkFromAnnotation. Crée le ticket + le
 * lien dans une même transaction.
 */
export const createTicketLinkFromAnnotationSchema = z.object({
  projectId: z.string().uuid(),
  annotation: previewAnnotationSchema,
  title: z.string().min(3).max(255),
  description: z.string().min(1).max(10000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  category: z.string().min(1).max(100).default('preview-annotation'),
});

export type CreateTicketLinkFromAnnotationInput = z.input<
  typeof createTicketLinkFromAnnotationSchema
>;
