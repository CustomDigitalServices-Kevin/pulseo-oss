import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  tickets,
  ticket_comments,
  ticket_attachments,
  contracts,
  organizations,
  users,
  organization_members,
  audit_logs,
  documents,
  invite_links,
} from '@/lib/db/schema';

// ─── Types sélection (lecture DB) ────────────────────────────────────────────

export type Organization = InferSelectModel<typeof organizations>;
export type User = InferSelectModel<typeof users>;
export type OrganizationMember = InferSelectModel<typeof organization_members>;
export type Ticket = InferSelectModel<typeof tickets>;
export type TicketComment = InferSelectModel<typeof ticket_comments>;
export type TicketAttachment = InferSelectModel<typeof ticket_attachments>;
export type Contract = InferSelectModel<typeof contracts>;
export type AuditLog = InferSelectModel<typeof audit_logs>;
export type Document = InferSelectModel<typeof documents>;
export type InviteLink = InferSelectModel<typeof invite_links>;

// ─── Types insertion (création DB) ───────────────────────────────────────────

export type TicketInsert = InferInsertModel<typeof tickets>;
export type TicketCommentInsert = InferInsertModel<typeof ticket_comments>;
export type TicketAttachmentInsert = InferInsertModel<typeof ticket_attachments>;

// ─── Types étendus avec relations ────────────────────────────────────────────

export type TicketWithRelations = Ticket & {
  creator?: { id: string; name: string | null; email: string };
  assignee?: { id: string; name: string | null; email: string } | null;
  comments?: TicketComment[];
  attachments?: TicketAttachment[];
  contract?: Contract | null;
};

// ─── Énums ───────────────────────────────────────────────────────────────────

export const TicketStatus = {
  new: 'new',
  in_progress: 'in_progress',
  waiting_client: 'waiting_client',
  resolved: 'resolved',
  closed: 'closed',
} as const;

export const TicketPriority = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
} as const;

export const TicketCategory = {
  bug: 'bug',
  feature: 'feature',
  support: 'support',
  maintenance: 'maintenance',
} as const;

export type TicketStatusType = (typeof TicketStatus)[keyof typeof TicketStatus];
export type TicketPriorityType = (typeof TicketPriority)[keyof typeof TicketPriority];
export type TicketCategoryType = (typeof TicketCategory)[keyof typeof TicketCategory];

// ─── Labels français ─────────────────────────────────────────────────────────

export const TicketStatusLabels: Record<TicketStatusType, string> = {
  new: 'Nouveau',
  in_progress: 'En cours',
  waiting_client: 'En attente client',
  resolved: 'Résolu',
  closed: 'Fermé',
};

export const TicketPriorityLabels: Record<TicketPriorityType, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
};

export const TicketCategoryLabels: Record<TicketCategoryType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  support: 'Support',
  maintenance: 'Maintenance',
};

// ─── Contrats ────────────────────────────────────────────────────────────────

export type ContractInsert = InferInsertModel<typeof contracts>;

export const ContractStatus = {
  active: 'active',
  expired: 'expired',
  terminated: 'terminated',
} as const;

export type ContractStatusType = (typeof ContractStatus)[keyof typeof ContractStatus];

export const ContractStatusLabels: Record<ContractStatusType, string> = {
  active: 'Actif',
  expired: 'Expire',
  terminated: 'Resilie',
};

// ─── Documents ───────────────────────────────────────────────────────────────

export const DocumentType = {
  invoice: 'invoice',
  quote: 'quote',
  report: 'report',
  other: 'other',
} as const;

export type DocumentTypeType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentTypeLabels: Record<DocumentTypeType, string> = {
  invoice: 'Facture',
  quote: 'Devis',
  report: 'Rapport',
  other: 'Autre',
};

export const DocumentSourceLabels: Record<string, string> = {
  manual: 'Manuel',
  qonto: 'Qonto',
};

export interface ContractWithQuota extends Contract {
  consumedPercent: number;
  remainingHours: number;
  isOverQuota: boolean;
}
