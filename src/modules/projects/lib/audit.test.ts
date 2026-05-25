// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', () => import('@/modules/projects/test/db-test'));

import { writeProjectAuditLog } from './audit';
import { resetDb, db, projectsSchema } from '@/modules/projects/test/db-test';
import { makeUser, makeOrg } from '@/modules/projects/test/fixtures';
import { eq } from 'drizzle-orm';

beforeEach(async () => { await resetDb(); });

describe('writeProjectAuditLog', () => {
  it('inserts a log row with all fields', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await writeProjectAuditLog({
      organizationId: org.id,
      actorId: user.id,
      eventType: 'project_created',
      entityType: 'project',
      entityId: 'proj-xyz',
      metadata: { name: 'Refonte intranet' },
    });

    const rows = await db.select().from(projectsSchema.projAuditLogs)
      .where(eq(projectsSchema.projAuditLogs.organization_id, org.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: 'project_created',
      entity_type: 'project',
      entity_id: 'proj-xyz',
      actor_id: user.id,
    });
    expect(rows[0].metadata).toEqual({ name: 'Refonte intranet' });
  });

  it('accepts null actor (system cron)', async () => {
    const org = await makeOrg();
    await writeProjectAuditLog({
      organizationId: org.id,
      actorId: null,
      eventType: 'hard_purge_executed',
      entityType: 'deliverable',
      entityId: 'del-1',
    });
    const rows = await db.select().from(projectsSchema.projAuditLogs);
    expect(rows[0].actor_id).toBeNull();
  });

  it('never logs secrets — top-level metadata filter', async () => {
    const org = await makeOrg();
    const user = await makeUser();
    await writeProjectAuditLog({
      organizationId: org.id,
      actorId: user.id,
      eventType: 'github_token_set',
      entityType: 'github_token',
      entityId: org.id,
      metadata: { token: 'ghp_sensitive_12345', note: 'ok' },
    });
    const rows = await db.select().from(projectsSchema.projAuditLogs);
    expect(rows[0].metadata).toEqual({ token: '***REDACTED***', note: 'ok' });
  });

  it('redacts nested secrets (deep walk)', async () => {
    const org = await makeOrg();
    const user = await makeUser();
    await writeProjectAuditLog({
      organizationId: org.id,
      actorId: user.id,
      eventType: 'github_token_rotated',
      entityType: 'github_token',
      entityId: org.id,
      metadata: {
        context: { old: { token: 'ghp_old' }, new: { token: 'ghp_new' } },
        safe: 'visible',
      },
    });
    const rows = await db.select().from(projectsSchema.projAuditLogs);
    expect(rows[0].metadata).toEqual({
      context: { old: { token: '***REDACTED***' }, new: { token: '***REDACTED***' } },
      safe: 'visible',
    });
  });
});
