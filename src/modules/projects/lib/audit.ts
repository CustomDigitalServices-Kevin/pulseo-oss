/**
 * Audit logging du module Projets.
 *
 * Écrit dans `projects.proj_audit_logs` (isolation schema respectée, pas
 * d'insert dans public.audit_logs — séparation core/module).
 *
 * Events obligatoires (cf spec §"Audit logging") :
 *  - project_created / updated / soft_deleted / restored
 *  - document_downloaded, deliverable_downloaded, deliverable_preview_viewed
 *  - recipe_status_overridden
 *  - github_token_set / rotated / deleted
 *  - virus_scan_infected_detected, hard_purge_executed
 *  - ticket_link_created
 */
import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db';
import { projAuditLogs } from '@/modules/projects/schema/tables';
import { logger } from '@/lib/logger';

type ProjectAuditEvent =
  | 'project_created' | 'project_updated' | 'project_soft_deleted' | 'project_restored'
  | 'document_uploaded' | 'document_downloaded' | 'document_deleted'
  | 'deliverable_uploaded' | 'deliverable_downloaded' | 'deliverable_preview_viewed' | 'deliverable_deleted'
  | 'recipe_test_created' | 'recipe_test_updated' | 'recipe_test_deleted'
  | 'recipe_test_commented' | 'recipe_test_status_changed'
  | 'recipe_status_changed' | 'recipe_status_overridden'
  | 'github_token_set' | 'github_token_rotated' | 'github_token_deleted'
  | 'virus_scan_infected_detected' | 'soft_delete_executed' | 'hard_purge_executed'
  | 'ticket_link_created';

type ProjectAuditEntity = 'project' | 'document' | 'deliverable' | 'recipe_test' | 'github_token';

export interface ProjectAuditInput {
  organizationId: string;
  actorId: string | null;  // null pour system cron
  eventType: ProjectAuditEvent;
  entityType: ProjectAuditEntity;
  entityId: string;
  metadata?: Record<string, unknown>;
}

// Clés à masquer dans metadata pour éviter les fuites accidentelles.
const SECRET_KEYS = new Set(['token', 'encrypted_token', 'secret', 'password', 'api_key']);

/**
 * Deep-walk redaction : descend dans les objets imbriqués pour masquer les
 * secrets nested (`{config: {token: "xxx"}}` → `{config: {token: "***REDACTED***"}}`).
 */
function redactSecrets(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactSecrets);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.has(k) ? '***REDACTED***' : redactSecrets(v);
  }
  return out;
}

export async function writeProjectAuditLog(input: ProjectAuditInput): Promise<void> {
  try {
    await db.insert(projAuditLogs).values({
      id: uuid(),
      organization_id: input.organizationId,
      actor_id: input.actorId,
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: input.metadata ? (redactSecrets(input.metadata) as Record<string, unknown>) : null,
    });
  } catch (err) {
    // Ne jamais casser un flow métier à cause d'un audit log raté — log l'erreur.
    logger.error('[projects/audit] insert failed', {
      eventType: input.eventType, entityType: input.entityType, err: String(err),
    });
  }
}
