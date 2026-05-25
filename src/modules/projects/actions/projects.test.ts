// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', () => import('@/modules/projects/test/db-test'));
vi.mock('@/lib/auth/session', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, getSessionInfo: vi.fn() };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// Force flag on pour les tests CRUD — le comportement flag-off est couvert
// par feature-flag.test.ts qui manipule `process.env` directement.
vi.mock('@/modules/projects/feature-flag', () => ({
  isProjectsEnabled: () => true,
  isFlowPreviewEnabled: () => false,
  isMsappPreviewEnabled: () => false,
  isSolutionPreviewEnabled: () => false,
  isPbixPreviewEnabled: () => false,
}));

import {
  listProjects, createProject, updateProject, softDeleteProject, restoreProject,
} from './projects';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db, projectsSchema } from '@/modules/projects/test/db-test';
import { makeUser, makeOrg, makeMembership, makeProject } from '@/modules/projects/test/fixtures';
import { eq } from 'drizzle-orm';

beforeEach(async () => { await resetDb(); vi.clearAllMocks(); });

async function loginAs(user: { id: string; is_superadmin?: boolean }) {
  vi.mocked(getSessionInfo).mockResolvedValue({
    userId: user.id,
    isSuperadmin: user.is_superadmin ?? false,
  } as never);
}

describe('createProject', () => {
  it('creates for gestionnaire', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    await loginAs(user);

    const r = await createProject({
      organizationId: org.id,
      name: 'Refonte', type: 'refonte', status: 'chiffrage',
    });
    expect(r.success).toBe(true);
    const rows = await db.select().from(projectsSchema.projProjects);
    expect(rows).toHaveLength(1);
    expect(rows[0].created_by).toBe(user.id);
  });

  it('denies viewer', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'viewer');
    await loginAs(user);

    const r = await createProject({
      organizationId: org.id, name: 'x', type: 'dev', status: 'chiffrage',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('denies gestionnaire of other org (IDOR)', async () => {
    const user = await makeUser();
    const org1 = await makeOrg();
    const org2 = await makeOrg();
    await makeMembership(user.id, org1.id, 'gestionnaire');
    await loginAs(user);

    const r = await createProject({
      organizationId: org2.id, name: 'x', type: 'dev', status: 'chiffrage',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('writes audit log on success', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    await loginAs(user);

    await createProject({
      organizationId: org.id, name: 'Refonte', type: 'refonte', status: 'chiffrage',
    });
    const audit = await db.select().from(projectsSchema.projAuditLogs);
    expect(audit).toHaveLength(1);
    expect(audit[0].event_type).toBe('project_created');
  });
});

describe('listProjects', () => {
  it('returns only projects of the org for gestionnaire', async () => {
    const user = await makeUser();
    const org1 = await makeOrg();
    const org2 = await makeOrg();
    await makeMembership(user.id, org1.id, 'gestionnaire');
    await makeProject({ organization_id: org1.id, created_by: user.id, name: 'A' });
    await makeProject({ organization_id: org2.id, created_by: user.id, name: 'B' });
    await loginAs(user);

    const r = await listProjects({ organizationId: org1.id });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].name).toBe('A');
    }
  });

  it('excludes soft-deleted by default', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p1 = await makeProject({ organization_id: org.id, created_by: user.id });
    await db.update(projectsSchema.projProjects)
      .set({ deleted_at: new Date() })
      .where(eq(projectsSchema.projProjects.id, p1.id));
    await loginAs(user);

    const r = await listProjects({ organizationId: org.id });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('denies viewer', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'viewer');
    await loginAs(user);

    const r = await listProjects({ organizationId: org.id });
    expect(r.success).toBe(false);
  });
});

describe('updateProject', () => {
  it('updates for admin org', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const r = await updateProject(p.id, { status: 'recette' });
    expect(r.success).toBe(true);
    const [row] = await db.select().from(projectsSchema.projProjects)
      .where(eq(projectsSchema.projProjects.id, p.id));
    expect(row.status).toBe('recette');
  });

  it('denies cross-org IDOR', async () => {
    const attacker = await makeUser();
    const victimOrg = await makeOrg();
    const victim = await makeUser();
    const p = await makeProject({ organization_id: victimOrg.id, created_by: victim.id });
    await loginAs(attacker);

    const r = await updateProject(p.id, { status: 'archive' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('writes audit log on success', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    await updateProject(p.id, { status: 'recette' });
    const audit = await db.select().from(projectsSchema.projAuditLogs);
    expect(audit.some((a) => a.event_type === 'project_updated' && a.entity_id === p.id)).toBe(true);
  });

  it('rejects update on already soft-deleted project', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await db.update(projectsSchema.projProjects)
      .set({ deleted_at: new Date() })
      .where(eq(projectsSchema.projProjects.id, p.id));
    await loginAs(user);

    const r = await updateProject(p.id, { status: 'recette' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('already_deleted');
  });
});

describe('softDeleteProject + restoreProject', () => {
  it('soft-deletes then restores', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    await softDeleteProject(p.id);
    let [row] = await db.select().from(projectsSchema.projProjects)
      .where(eq(projectsSchema.projProjects.id, p.id));
    expect(row.deleted_at).not.toBeNull();

    await restoreProject(p.id);
    [row] = await db.select().from(projectsSchema.projProjects)
      .where(eq(projectsSchema.projProjects.id, p.id));
    expect(row.deleted_at).toBeNull();
  });

  it('returns not_found for non-existent project', async () => {
    const user = await makeUser({ is_superadmin: true });
    await loginAs(user);
    const r = await softDeleteProject('00000000-0000-0000-0000-000000000000');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('not_found');
  });

  it('denies cross-org IDOR on soft delete', async () => {
    const attacker = await makeUser();
    const victimOrg = await makeOrg();
    const victim = await makeUser();
    const p = await makeProject({ organization_id: victimOrg.id, created_by: victim.id });
    await loginAs(attacker);

    const r = await softDeleteProject(p.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('writes audit logs for soft delete + restore', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    await softDeleteProject(p.id);
    await restoreProject(p.id);

    const audit = await db.select().from(projectsSchema.projAuditLogs);
    expect(audit.some((a) => a.event_type === 'project_soft_deleted' && a.entity_id === p.id)).toBe(true);
    expect(audit.some((a) => a.event_type === 'project_restored' && a.entity_id === p.id)).toBe(true);
  });

  it('rejects soft delete on already-deleted project', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await db.update(projectsSchema.projProjects)
      .set({ deleted_at: new Date() })
      .where(eq(projectsSchema.projProjects.id, p.id));
    await loginAs(user);

    const r = await softDeleteProject(p.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('already_deleted');
  });

  it('rejects restore on non-deleted project', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const r = await restoreProject(p.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('not_deleted');
  });
});
