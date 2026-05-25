// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', () => import('@/modules/projects/test/db-test'));

import { hasProjectsAccess } from './permissions';
import { resetDb, db, coreSchema } from '@/modules/projects/test/db-test';
import { makeUser, makeOrg, makeMembership } from '@/modules/projects/test/fixtures';
import { v4 as uuid } from 'uuid';

beforeEach(async () => { await resetDb(); });

describe('hasProjectsAccess', () => {
  it('returns false for unknown user', async () => {
    const org = await makeOrg();
    expect(await hasProjectsAccess('unknown-user-id', org.id)).toBe(false);
  });

  it('returns false for viewer', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'viewer');
    expect(await hasProjectsAccess(user.id, org.id)).toBe(false);
  });

  it('returns true for gestionnaire', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    expect(await hasProjectsAccess(user.id, org.id)).toBe(true);
  });

  it('returns true for admin org', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'admin');
    expect(await hasProjectsAccess(user.id, org.id)).toBe(true);
  });

  it('returns true for superadmin even without org membership', async () => {
    const user = await makeUser({ is_superadmin: true });
    const org = await makeOrg();
    expect(await hasProjectsAccess(user.id, org.id)).toBe(true);
  });

  it('returns true for team member with grant on org', async () => {
    const creator = await makeUser();
    const user = await makeUser();
    const org = await makeOrg();
    const teamId = uuid();
    await db.insert(coreSchema.teams).values({
      id: teamId, name: 'SousTraitants X', slug: 't-x', created_by_user_id: creator.id,
    });
    await db.insert(coreSchema.team_members).values({
      id: uuid(), team_id: teamId, user_id: user.id,
    });
    await db.insert(coreSchema.team_organization_grants).values({
      id: uuid(), team_id: teamId, organization_id: org.id,
      role: 'viewer', granted_by_user_id: creator.id,
    });
    expect(await hasProjectsAccess(user.id, org.id)).toBe(true);
  });

  it('returns false if team member but no grant on this org', async () => {
    const creator = await makeUser();
    const user = await makeUser();
    const org1 = await makeOrg();
    const org2 = await makeOrg();
    const teamId = uuid();
    await db.insert(coreSchema.teams).values({
      id: teamId, name: 'T', slug: 't-1', created_by_user_id: creator.id,
    });
    await db.insert(coreSchema.team_members).values({
      id: uuid(), team_id: teamId, user_id: user.id,
    });
    await db.insert(coreSchema.team_organization_grants).values({
      id: uuid(), team_id: teamId, organization_id: org1.id,
      role: 'viewer', granted_by_user_id: creator.id,
    });
    expect(await hasProjectsAccess(user.id, org2.id)).toBe(false);
  });

  it('returns false for gestionnaire of another org (IDOR test)', async () => {
    const user = await makeUser();
    const org1 = await makeOrg();
    const org2 = await makeOrg();
    await makeMembership(user.id, org1.id, 'gestionnaire');
    expect(await hasProjectsAccess(user.id, org2.id)).toBe(false);
  });
});
