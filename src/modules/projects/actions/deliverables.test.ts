// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', () => import('@/modules/projects/test/db-test'));
vi.mock('@/lib/auth/session', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, getSessionInfo: vi.fn() };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/projects/feature-flag', () => ({
  isProjectsEnabled: () => true,
  isFlowPreviewEnabled: () => false,
  isMsappPreviewEnabled: () => false,
  isSolutionPreviewEnabled: () => false,
  isPbixPreviewEnabled: () => false,
}));
// P4c : mock scan-enqueue — simulate un scan auto-'clean' sans graphile-worker.
vi.mock('@/modules/projects/lib/scan-enqueue', async () => {
  const { db } = await import('@/modules/projects/test/db-test');
  const { projDeliverables } = await import('@/modules/projects/schema/tables');
  const { eq } = await import('drizzle-orm');
  return {
    enqueueVirusScan: async (opts: { entityType: string; entityId: string }) => {
      if (opts.entityType === 'deliverable') {
        await db
          .update(projDeliverables)
          .set({ virus_scan_status: 'clean' })
          .where(eq(projDeliverables.id, opts.entityId));
      }
    },
  };
});

import {
  listDeliverables,
  promoteDeliverableVersion,
  softDeleteDeliverable,
  restoreDeliverable,
} from './deliverables';
import { insertDeliverableWithVersioning } from '@/modules/projects/lib/deliverables-db';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db, projectsSchema } from '@/modules/projects/test/db-test';
import {
  makeUser,
  makeOrg,
  makeMembership,
  makeProject,
} from '@/modules/projects/test/fixtures';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

async function loginAs(user: { id: string; is_superadmin?: boolean }) {
  vi.mocked(getSessionInfo).mockResolvedValue({
    userId: user.id,
    isSuperadmin: user.is_superadmin ?? false,
  } as never);
}

async function seedDeliverable(opts: {
  projectId: string;
  organizationId: string;
  userId: string;
  version: string;
  markAsLatest: boolean;
}): Promise<string> {
  const id = uuid();
  await insertDeliverableWithVersioning({
    id,
    projectId: opts.projectId,
    organizationId: opts.organizationId,
    userId: opts.userId,
    version: opts.version,
    filePath: `/tmp/fake/${id}.pdf`,
    originalName: `file-v${opts.version}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    markAsLatest: opts.markAsLatest,
  });
  return id;
}

describe('insertDeliverableWithVersioning — versioning transactionnel', () => {
  it('markAsLatest=true sur le 1er deliverable → row is_latest=true', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });

    const id = await seedDeliverable({
      projectId: project.id,
      organizationId: org.id,
      userId: user.id,
      version: '1.0',
      markAsLatest: true,
    });

    const [row] = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.id, id));
    expect(row.is_latest).toBe(true);
    expect(row.version).toBe('1.0');
  });

  it('nouveau markAsLatest=true → ancien passe à is_latest=false', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });

    const firstId = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    const secondId = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '2.0', markAsLatest: true,
    });

    const rows = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.project_id, project.id));
    const first = rows.find((r) => r.id === firstId)!;
    const second = rows.find((r) => r.id === secondId)!;
    expect(first.is_latest).toBe(false);
    expect(second.is_latest).toBe(true);
  });

  it('markAsLatest=false ne touche pas l\'existant', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });

    const firstId = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    const secondId = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.5', markAsLatest: false,
    });

    const [first] = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.id, firstId));
    const [second] = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.id, secondId));
    expect(first.is_latest).toBe(true);
    expect(second.is_latest).toBe(false);
  });

  it('UNIQUE partial index empêche 2 is_latest=true concurrents (sanity check)', async () => {
    // Ce test vérifie que le schema a bien la contrainte. Normalement
    // insertDeliverableWithVersioning protège via transaction mais un
    // INSERT brut qui oublie l'UPDATE doit violer l'index.
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });

    await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });

    // INSERT brut contournant la transaction
    await expect(
      db.insert(projectsSchema.projDeliverables).values({
        id: uuid(),
        project_id: project.id,
        kind: 'file',
        version: '2.0',
        is_latest: true,
        file_path: '/tmp/x',
        original_name: 'x.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1,
        virus_scan_status: 'skipped',
        uploaded_by: user.id,
      }),
    ).rejects.toThrow();
  });
});

describe('listDeliverables', () => {
  it('liste pour gestionnaire', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    await loginAs(user);

    const r = await listDeliverables({ projectId: project.id });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(1);
  });

  it('refuse viewer', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'viewer');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const r = await listDeliverables({ projectId: project.id });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('refuse IDOR cross-org', async () => {
    const userA = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(userA.id, orgA.id, 'admin');
    const projectB = await makeProject({ organization_id: orgB.id, created_by: userA.id });
    await loginAs(userA);

    const r = await listDeliverables({ projectId: projectB.id });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('exclut les deleted par défaut', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    await db
      .update(projectsSchema.projDeliverables)
      .set({ deleted_at: new Date(), is_latest: false })
      .where(eq(projectsSchema.projDeliverables.id, id));
    await loginAs(user);

    const r = await listDeliverables({ projectId: project.id });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);

    const rAll = await listDeliverables({ projectId: project.id, includeDeleted: true });
    expect(rAll.success).toBe(true);
    if (rAll.success) expect(rAll.data).toHaveLength(1);
  });
});

describe('promoteDeliverableVersion', () => {
  it('promote un ancien en latest, dégrade le current latest', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const v1 = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    const v2 = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '2.0', markAsLatest: true,
    });
    await loginAs(user);

    // v2 est latest. On promote v1 à latest.
    const r = await promoteDeliverableVersion({ deliverableId: v1 });
    expect(r.success).toBe(true);

    const rows = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.project_id, project.id));
    expect(rows.find((r) => r.id === v1)!.is_latest).toBe(true);
    expect(rows.find((r) => r.id === v2)!.is_latest).toBe(false);
  });

  it('no-op si déjà latest', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    await loginAs(user);

    const r = await promoteDeliverableVersion({ deliverableId: id });
    expect(r.success).toBe(true);
  });

  it('refuse IDOR cross-org', async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(userA.id, orgA.id, 'admin');
    await makeMembership(userB.id, orgB.id, 'admin');
    const projectB = await makeProject({ organization_id: orgB.id, created_by: userB.id });
    const dB = await seedDeliverable({
      projectId: projectB.id, organizationId: orgB.id, userId: userB.id,
      version: '1.0', markAsLatest: true,
    });
    await loginAs(userA);

    const r = await promoteDeliverableVersion({ deliverableId: dB });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });
});

describe('softDeleteDeliverable', () => {
  it('marque deleted_at + promote le file suivant si c\'était latest', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const v1 = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: false,
    });
    const v2 = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '2.0', markAsLatest: true,
    });
    await loginAs(user);

    const r = await softDeleteDeliverable({ deliverableId: v2 });
    expect(r.success).toBe(true);

    const [v2After] = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.id, v2));
    expect(v2After.deleted_at).not.toBeNull();
    expect(v2After.is_latest).toBe(false);

    const [v1After] = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.id, v1));
    expect(v1After.is_latest).toBe(true);
  });

  it('si pas de suivant non-supprimé, aucun promote (fail-safe)', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    await loginAs(user);

    const r = await softDeleteDeliverable({ deliverableId: id });
    expect(r.success).toBe(true);

    const rows = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.project_id, project.id));
    expect(rows.every((r) => !r.is_latest)).toBe(true);
  });

  it('refuse déjà deleted', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: false,
    });
    await db
      .update(projectsSchema.projDeliverables)
      .set({ deleted_at: new Date() })
      .where(eq(projectsSchema.projDeliverables.id, id));
    await loginAs(user);

    const r = await softDeleteDeliverable({ deliverableId: id });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('already_deleted');
  });

  it('refuse IDOR cross-org', async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(userA.id, orgA.id, 'admin');
    const projectB = await makeProject({ organization_id: orgB.id, created_by: userB.id });
    const dB = await seedDeliverable({
      projectId: projectB.id, organizationId: orgB.id, userId: userB.id,
      version: '1.0', markAsLatest: true,
    });
    await loginAs(userA);

    const r = await softDeleteDeliverable({ deliverableId: dB });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('audit log sur succès', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    await loginAs(user);

    const r = await softDeleteDeliverable({ deliverableId: id });
    expect(r.success).toBe(true);

    const logs = await db
      .select()
      .from(projectsSchema.projAuditLogs)
      .where(
        and(
          eq(projectsSchema.projAuditLogs.entity_id, id),
          eq(projectsSchema.projAuditLogs.event_type, 'deliverable_deleted'),
        ),
      );
    expect(logs).toHaveLength(1);
  });
});

describe('restoreDeliverable', () => {
  it('restore un deleted + is_latest reste false', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    await db
      .update(projectsSchema.projDeliverables)
      .set({ deleted_at: new Date(), is_latest: false })
      .where(eq(projectsSchema.projDeliverables.id, id));
    await loginAs(user);

    const r = await restoreDeliverable({ deliverableId: id });
    expect(r.success).toBe(true);

    const [row] = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.id, id));
    expect(row.deleted_at).toBeNull();
    expect(row.is_latest).toBe(false);
  });

  it('refuse not_deleted', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedDeliverable({
      projectId: project.id, organizationId: org.id, userId: user.id,
      version: '1.0', markAsLatest: true,
    });
    await loginAs(user);

    const r = await restoreDeliverable({ deliverableId: id });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('not_deleted');
  });
});
