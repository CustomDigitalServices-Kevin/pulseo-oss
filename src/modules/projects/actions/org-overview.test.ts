// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', () => import('@/modules/projects/test/db-test'));
vi.mock('@/lib/auth/session', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, getSessionInfo: vi.fn() };
});
const isProjectsEnabledMock = vi.fn(() => true);
vi.mock('@/modules/projects/feature-flag', () => ({
  isProjectsEnabled: () => isProjectsEnabledMock(),
  isFlowPreviewEnabled: () => false,
  isMsappPreviewEnabled: () => false,
  isSolutionPreviewEnabled: () => false,
  isPbixPreviewEnabled: () => false,
}));

import { getOrgProjectsOverview } from './org-overview';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db, projectsSchema } from '@/modules/projects/test/db-test';
import { makeUser, makeOrg, makeMembership, makeProject } from '@/modules/projects/test/fixtures';
import { v4 as uuid } from 'uuid';

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  isProjectsEnabledMock.mockReturnValue(true);
});

async function loginAs(user: { id: string; is_superadmin?: boolean }) {
  vi.mocked(getSessionInfo).mockResolvedValue({
    userId: user.id,
    isSuperadmin: user.is_superadmin ?? false,
  } as never);
}

describe('getOrgProjectsOverview', () => {
  it('returns null when flag disabled', async () => {
    isProjectsEnabledMock.mockReturnValue(false);
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    await loginAs(user);

    const r = await getOrgProjectsOverview(org.id);
    expect(r).toBeNull();
  });

  it('returns null for viewer without gestionnaire access', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'viewer');
    await loginAs(user);

    const r = await getOrgProjectsOverview(org.id);
    expect(r).toBeNull();
  });

  it('returns null for IDOR attempt (gestionnaire of other org)', async () => {
    const user = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(user.id, orgA.id, 'gestionnaire');
    await loginAs(user);

    const r = await getOrgProjectsOverview(orgB.id);
    expect(r).toBeNull();
  });

  it('returns zero shape for org with no projects', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    await loginAs(user);

    const r = await getOrgProjectsOverview(org.id);
    expect(r).not.toBeNull();
    expect(r!.kpis).toEqual({
      activeCount: 0,
      latestDeliverables: 0,
      recipePercent: null,
    });
    expect(r!.recentProjects).toEqual([]);
  });

  it('computes KPIs correctly — active count excludes valide/archive/deleted, deliverables only latest+clean, recipe% over passed tests', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    await loginAs(user);

    // 5 projets : 2 actifs (en_cours, recette), 1 validé (exclu du KPI actifs), 1 archivé (exclu), 1 supprimé (exclu)
    const p1 = await makeProject({ organization_id: org.id, created_by: user.id, status: 'en_cours', name: 'P1' });
    const p2 = await makeProject({ organization_id: org.id, created_by: user.id, status: 'recette', name: 'P2' });
    await makeProject({ organization_id: org.id, created_by: user.id, status: 'valide', name: 'P3' });
    await makeProject({ organization_id: org.id, created_by: user.id, status: 'archive', name: 'P4' });
    const pDel = await makeProject({
      organization_id: org.id, created_by: user.id, status: 'en_cours', name: 'P5',
      deleted_at: new Date(),
    });

    // Deliverables (contrainte UNIQUE partial : 1 is_latest+clean/pending max par projet) :
    // - p1 latest+clean v2 + non-latest pending v1  → +1 clean, pending exclu (not latest)
    // - p2 latest+pending v1                        → 0 clean (pending exclu)
    // - pDel latest+clean                            → 0 (projet soft-deleted exclu par JOIN)
    await db.insert(projectsSchema.projDeliverables).values([
      { id: uuid(), project_id: p1.id, kind: 'file', version: 'v1', is_latest: false,
        virus_scan_status: 'pending', uploaded_by: user.id, file_path: '/a', original_name: 'a.pdf',
        mime_type: 'application/pdf', size_bytes: 100 },
      { id: uuid(), project_id: p1.id, kind: 'file', version: 'v2', is_latest: true,
        virus_scan_status: 'clean', uploaded_by: user.id, file_path: '/b', original_name: 'b.pdf',
        mime_type: 'application/pdf', size_bytes: 100 },
      { id: uuid(), project_id: p2.id, kind: 'file', version: 'v1', is_latest: true,
        virus_scan_status: 'pending', uploaded_by: user.id, file_path: '/c', original_name: 'c.pdf',
        mime_type: 'application/pdf', size_bytes: 100 },
      { id: uuid(), project_id: pDel.id, kind: 'file', version: 'v1', is_latest: true,
        virus_scan_status: 'clean', uploaded_by: user.id, file_path: '/d', original_name: 'd.pdf',
        mime_type: 'application/pdf', size_bytes: 100 },
    ]);

    // Recipe tests : 3 ok / 2 ko sur p1 → 60%
    await db.insert(projectsSchema.projRecipeTests).values([
      { id: uuid(), project_id: p1.id, title: 't1', status: 'ok' },
      { id: uuid(), project_id: p1.id, title: 't2', status: 'ok' },
      { id: uuid(), project_id: p1.id, title: 't3', status: 'ok' },
      { id: uuid(), project_id: p1.id, title: 't4', status: 'ko' },
      { id: uuid(), project_id: p1.id, title: 't5', status: 'ko' },
    ]);

    const r = await getOrgProjectsOverview(org.id);
    expect(r).not.toBeNull();
    expect(r!.kpis.activeCount).toBe(2);
    expect(r!.kpis.latestDeliverables).toBe(1); // seul p1 a latest+clean sur projet non-supprimé
    expect(r!.kpis.recipePercent).toBe(60);
  });

  it('returns top 3 recent projects sorted by updated_at desc, excluding deleted', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    await loginAs(user);

    const now = Date.now();
    const mk = async (name: string, minutesAgo: number, deleted = false) =>
      makeProject({
        organization_id: org.id, created_by: user.id, name,
        updated_at: new Date(now - minutesAgo * 60_000),
        deleted_at: deleted ? new Date() : null,
      });

    await mk('oldest', 50);
    const p2 = await mk('middle', 30);
    const p3 = await mk('newer', 20);
    const p4 = await mk('newest', 10);
    await mk('deleted-recent', 1, true);

    const r = await getOrgProjectsOverview(org.id);
    expect(r).not.toBeNull();
    expect(r!.recentProjects).toHaveLength(3);
    expect(r!.recentProjects.map((p) => p.name)).toEqual([p4.name, p3.name, p2.name]);
    expect(r!.recentProjects[0].id).toBe(p4.id);
  });
});
