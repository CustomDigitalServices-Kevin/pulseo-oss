/**
 * Fire-and-forget writer for `user_activity_events`.
 *
 * Events are queued via Next's `after()` so the HTTP response is never blocked
 * by activity logging. The utility is a strict no-op when
 * `ENABLE_ACTIVITY_LOGGING` is off (or any value other than `'true'`), and it
 * swallows its own DB errors so instrumented code paths can never fail because
 * of logging.
 *
 * Callers pass the actor (`userId`), the event type, and optional scoping info
 * (`organizationId`, `resourceId`, freeform `metadata`). The `organization_id`
 * column is nullable in the schema — events without an org context are fine.
 */
import { after } from 'next/server';
import { db } from '@/lib/db';
import { user_activity_events } from '@/lib/db/schema';
import { isActivityLoggingEnabled } from '@/lib/feature-flags';
import { logger } from '@/lib/logger';

export type EventType = 'login' | 'ticket_created' | 'ticket_commented';

export interface LogActivityParams {
  userId: string;
  organizationId?: string | null;
  eventType: EventType;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export function logActivityEvent(params: LogActivityParams): void {
  if (!isActivityLoggingEnabled()) return;

  after(async () => {
    try {
      await db.insert(user_activity_events).values({
        id: crypto.randomUUID(),
        user_id: params.userId,
        organization_id: params.organizationId ?? null,
        event_type: params.eventType,
        resource_id: params.resourceId ?? null,
        metadata: params.metadata ?? null,
      });
    } catch (err) {
      logger.error('[ACTIVITY] failed to log event', { err, params });
    }
  });
}
