'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import {
  projGithubTokens,
  projDeliverables,
} from '@/modules/projects/schema/tables';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import { encryptToken, currentKeyVersion } from '@/modules/projects/lib/crypto';
import {
  setGithubTokenInputSchema,
  createGithubDeliverableSchema,
  parseRepoRef,
  type SetGithubTokenInput,
  type CreateGithubDeliverableInput,
} from '@/modules/projects/lib/validations/github';
import { v4 as uuid } from 'uuid';
import { logger } from '@/lib/logger';

type Result<T> = { success: true; data: T } | { success: false; error: string };

function moduleGuard(): { error: string } | null {
  if (!isProjectsEnabled()) return { error: 'module_disabled' };
  return null;
}

/**
 * Crée ou met à jour le token GitHub pour une organisation.
 * Admin org + superadmin uniquement. Le token est chiffré AES-GCM avant
 * stockage. Audit log `github_token_set` ou `github_token_rotated`.
 */
export async function setGithubToken(
  rawInput: SetGithubTokenInput,
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = setGithubTokenInputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'invalid_input' };
  const { organizationId, token } = parsed.data;

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  const ok = await hasProjectsAccess(session.userId, organizationId);
  if (!ok) return { success: false, error: 'forbidden' };

  const version = currentKeyVersion();
  let encrypted: Buffer;
  try {
    encrypted = encryptToken(token, version);
  } catch (err) {
    logger.error('[projects/github-tokens/set] encrypt failed', { err: String(err) });
    return { success: false, error: 'crypto_error' };
  }

  // UPSERT : si row existante → rotate (UPDATE), sinon INSERT
  const [existing] = await db
    .select({ organization_id: projGithubTokens.organization_id })
    .from(projGithubTokens)
    .where(eq(projGithubTokens.organization_id, organizationId));

  try {
    if (existing) {
      await db
        .update(projGithubTokens)
        .set({ encrypted_token: encrypted, key_version: version, updated_at: new Date() })
        .where(eq(projGithubTokens.organization_id, organizationId));
    } else {
      await db.insert(projGithubTokens).values({
        organization_id: organizationId,
        encrypted_token: encrypted,
        key_version: version,
        created_by: session.userId,
      });
    }
  } catch (err) {
    logger.error('[projects/github-tokens/set] db write failed', { err: String(err) });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId,
    actorId: session.userId,
    eventType: existing ? 'github_token_rotated' : 'github_token_set',
    entityType: 'github_token',
    entityId: organizationId,
    metadata: { key_version: version },
  });

  revalidatePath(`/clients/[slug]/projects`, 'page');
  return { success: true, data: null };
}

export async function deleteGithubToken(organizationId: string): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  const ok = await hasProjectsAccess(session.userId, organizationId);
  if (!ok) return { success: false, error: 'forbidden' };

  try {
    await db.delete(projGithubTokens).where(eq(projGithubTokens.organization_id, organizationId));
  } catch (err) {
    logger.error('[projects/github-tokens/delete] failed', { err: String(err) });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId,
    actorId: session.userId,
    eventType: 'github_token_deleted',
    entityType: 'github_token',
    entityId: organizationId,
  });

  revalidatePath(`/clients/[slug]/projects`, 'page');
  return { success: true, data: null };
}

/**
 * Check si un token existe (sans le révéler). Utilisé par l'UI pour afficher
 * "Token configuré ✓" vs "Aucun token".
 */
export async function hasGithubToken(organizationId: string): Promise<Result<boolean>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  const ok = await hasProjectsAccess(session.userId, organizationId);
  if (!ok) return { success: false, error: 'forbidden' };

  const [row] = await db
    .select({ organization_id: projGithubTokens.organization_id })
    .from(projGithubTokens)
    .where(eq(projGithubTokens.organization_id, organizationId));
  return { success: true, data: !!row };
}

/**
 * Crée un deliverable kind='github_repo' référençant un repo GitHub
 * (owner/repo ou URL complète). Valide le format mais ne vérifie pas
 * l'existence du repo (validation fetch métadonnées = P9.3 proxy route).
 */
export async function createGithubRepoDeliverable(
  rawInput: CreateGithubDeliverableInput,
): Promise<Result<{ id: string }>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = createGithubDeliverableSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'invalid_input' };
  const input = parsed.data;

  const repoRef = parseRepoRef(input.githubUrl);
  if (!repoRef) return { success: false, error: 'invalid_repo_ref' };

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  // Charge projet + IDOR via hasProjectsAccess (pattern identique deliverables)
  const { projProjects } = await import('@/modules/projects/schema/tables');
  const [project] = await db
    .select({
      id: projProjects.id,
      organization_id: projProjects.organization_id,
      deleted_at: projProjects.deleted_at,
    })
    .from(projProjects)
    .where(eq(projProjects.id, input.projectId));
  if (!project) return { success: false, error: 'not_found' };
  if (project.deleted_at) return { success: false, error: 'project_deleted' };

  const ok = await hasProjectsAccess(session.userId, project.organization_id);
  if (!ok) return { success: false, error: 'forbidden' };

  const id = uuid();
  try {
    await db.insert(projDeliverables).values({
      id,
      project_id: project.id,
      kind: 'github_repo',
      version: input.version,
      is_latest: input.markAsLatest,
      github_url: `https://github.com/${repoRef.owner}/${repoRef.repo}`,
      github_branch: input.githubBranch,
      virus_scan_status: 'clean', // n/a pour les repos (pas de fichier local)
      uploaded_by: session.userId,
    });
  } catch (err) {
    logger.error('[projects/github-tokens/create-deliverable] failed', {
      err: String(err), projectId: project.id,
    });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: project.organization_id,
    actorId: session.userId,
    eventType: 'deliverable_uploaded',
    entityType: 'deliverable',
    entityId: id,
    metadata: {
      kind: 'github_repo',
      github_owner: repoRef.owner,
      github_repo: repoRef.repo,
      project_id: project.id,
    },
  });

  revalidatePath(`/clients/[slug]/projects/${project.id}`, 'page');
  return { success: true, data: { id } };
}
