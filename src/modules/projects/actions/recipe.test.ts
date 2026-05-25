// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', () => import('@/modules/projects/test/db-test'));
vi.mock('@/lib/auth/session', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, getSessionInfo: vi.fn() };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/projects/feature-flag', () => ({ isProjectsEnabled: () => true, isFlowPreviewEnabled: () => false, isMsappPreviewEnabled: () => false, isSolutionPreviewEnabled: () => false, isPbixPreviewEnabled: () => false }));

import {
  listRecipeTests,
  createRecipeTest,
  changeRecipeStatus,
  addRecipeComment,
  listRecipeEvents,
} from './recipe';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db, projectsSchema } from '@/modules/projects/test/db-test';
import { makeUser, makeOrg, makeMembership, makeProject } from '@/modules/projects/test/fixtures';
import { eq } from 'drizzle-orm';

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

describe('createRecipeTest', () => {
  it('creates for gestionnaire', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const r = await createRecipeTest({ projectId: p.id, title: 'Login magic link' });
    expect(r.success).toBe(true);
    const rows = await db.select().from(projectsSchema.projRecipeTests);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Login magic link');
    expect(rows[0].status).toBe('a_faire');
  });

  it('denies viewer', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'viewer');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const r = await createRecipeTest({ projectId: p.id, title: 'x' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('denies cross-org IDOR', async () => {
    const attacker = await makeUser();
    const victimOrg = await makeOrg();
    const victim = await makeUser();
    const p = await makeProject({ organization_id: victimOrg.id, created_by: victim.id });
    await loginAs(attacker);

    const r = await createRecipeTest({ projectId: p.id, title: 'x' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });

  it('writes audit log', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    await createRecipeTest({ projectId: p.id, title: 'Audit test' });
    const audit = await db.select().from(projectsSchema.projAuditLogs);
    expect(audit.some((a) => a.event_type === 'recipe_test_created')).toBe(true);
  });
});

describe('changeRecipeStatus + listRecipeEvents', () => {
  it('creates status_change event and updates test status', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const c = await createRecipeTest({ projectId: p.id, title: 'T1' });
    if (!c.success) throw new Error('create failed');
    const testId = c.data.id;

    const r = await changeRecipeStatus(testId, { status: 'ok', note: 'Validé par le client' });
    expect(r.success).toBe(true);

    const [row] = await db
      .select()
      .from(projectsSchema.projRecipeTests)
      .where(eq(projectsSchema.projRecipeTests.id, testId));
    expect(row.status).toBe('ok');

    const events = await listRecipeEvents(testId);
    expect(events.success).toBe(true);
    if (events.success) {
      expect(events.data).toHaveLength(1);
      expect(events.data[0].event_type).toBe('status_change');
      expect(events.data[0].old_value).toBe('a_faire');
      expect(events.data[0].new_value).toBe('ok');
      expect(events.data[0].note).toBe('Validé par le client');
    }
  });

  it('denies viewer from changing status', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'viewer');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    // Seed a test as superadmin via direct insert
    const sa = await makeUser({ is_superadmin: true });
    await loginAs(sa);
    const c = await createRecipeTest({ projectId: p.id, title: 'T1' });
    if (!c.success) throw new Error('seed failed');

    // Re-login as viewer
    await loginAs(user);
    const r = await changeRecipeStatus(c.data.id, { status: 'ok' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('forbidden');
  });
});

describe('addRecipeComment', () => {
  it('appends a comment event', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const c = await createRecipeTest({ projectId: p.id, title: 'T1' });
    if (!c.success) throw new Error('create failed');

    const r = await addRecipeComment(c.data.id, { note: 'Bloqué côté infra' });
    expect(r.success).toBe(true);

    const events = await listRecipeEvents(c.data.id);
    if (events.success) {
      expect(events.data).toHaveLength(1);
      expect(events.data[0].event_type).toBe('comment');
      expect(events.data[0].note).toBe('Bloqué côté infra');
    }
  });
});

describe('listRecipeTests', () => {
  it('returns tests ordered by order_index', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    const p = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    await createRecipeTest({ projectId: p.id, title: 'A' });
    await createRecipeTest({ projectId: p.id, title: 'B' });
    await createRecipeTest({ projectId: p.id, title: 'C' });

    const r = await listRecipeTests(p.id);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.map((t) => t.title)).toEqual(['A', 'B', 'C']);
    }
  });
});
