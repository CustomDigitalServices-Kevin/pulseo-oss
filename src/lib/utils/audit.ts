import { db } from '@/lib/db';
import { audit_logs } from '@/lib/db/schema';
import { headers } from 'next/headers';
import { v4 as uuid } from 'uuid';
import { logger } from '@/lib/logger';

interface CreateAuditLogParams {
  actorId: string;
  orgId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
}

export async function createAuditLog({
  actorId,
  orgId,
  action,
  entityType,
  entityId,
  changes,
}: CreateAuditLogParams): Promise<void> {
  try {
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
      headersList.get('x-real-ip') ||
      null;

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      actor_id: actorId,
      changes: changes ?? null,
      ip_address: ipAddress,
    });
  } catch (error) {
    logger.error('Failed to create audit log', {
      error: String(error),
      action,
      entityType,
      entityId,
    });
  }
}
