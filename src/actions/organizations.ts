'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { organizations, organization_members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from '@/lib/validations/organizations';
import { requireSession, requireAdmin } from '@/lib/auth/session';
import { canAccessOrg } from '@/lib/auth/permissions';
import { createAuditLog } from '@/lib/utils/audit';
import { logger } from '@/lib/logger';

export async function createOrganization(formData: FormData) {
  const session = await requireAdmin();

  const data = {
    name: formData.get('name') as string,
    slug: formData.get('slug') as string,
    description: (formData.get('description') as string) || undefined,
    color_primary: (formData.get('color_primary') as string) || '#2563EB',
    color_secondary: (formData.get('color_secondary') as string) || '#1E40AF',
    qonto_client_email: (formData.get('qonto_client_email') as string) || undefined,
    responsible_email: (formData.get('responsible_email') as string) || undefined,
    responsible_name: (formData.get('responsible_name') as string) || undefined,
  };

  const validated = createOrganizationSchema.parse(data);
  const orgId = uuid();

  // Atomically: insert the org row + enroll the creator as admin member.
  // Without the membership row, all `/clients/[slug]/*` pages return 404
  // for the creator because they gate on `organization_members` lookup.
  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(organizations)
      .values({
        id: orgId,
        name: validated.name,
        slug: validated.slug,
        description: validated.description,
        color_primary: validated.color_primary,
        color_secondary: validated.color_secondary,
        qonto_client_email: validated.qonto_client_email || null,
        responsible_email: validated.responsible_email || null,
        responsible_name: validated.responsible_name || null,
      })
      .returning();

    await tx.insert(organization_members).values({
      id: uuid(),
      organization_id: orgId,
      user_id: session.user.id,
      role: 'admin',
    });

    return inserted;
  });

  await createAuditLog({
    actorId: session.user.id,
    orgId: orgId,
    action: 'created',
    entityType: 'organization',
    entityId: orgId,
    changes: { name: validated.name, slug: validated.slug },
  });

  revalidatePath('/admin/clients');
  return { success: true as const, data: result };
}

export async function updateOrganization(orgId: string, data: unknown) {
  const session = await requireAdmin();

  const validated = updateOrganizationSchema.parse(data);

  const updateData: Partial<typeof organizations.$inferInsert> = {
    ...validated,
    updated_at: new Date(),
  };

  const result = await db
    .update(organizations)
    .set(updateData)
    .where(eq(organizations.id, orgId))
    .returning();

  await createAuditLog({
    actorId: session.user.id,
    orgId: orgId,
    action: 'updated',
    entityType: 'organization',
    entityId: orgId,
    changes: validated,
  });

  if (result[0]) {
    revalidatePath(`/admin/clients/${result[0].slug}`);
  }
  revalidatePath('/admin/clients');
  return { success: true as const, data: result[0] };
}

export async function deleteOrganization(orgId: string) {
  const session = await requireAdmin();

  await db.delete(organizations).where(eq(organizations.id, orgId));

  await createAuditLog({
    actorId: session.user.id,
    orgId: orgId,
    action: 'deleted',
    entityType: 'organization',
    entityId: orgId,
  });

  revalidatePath('/admin/clients');
  return { success: true as const };
}

export async function getOrganization(slug: string) {
  try {
    const session = await requireSession();

    const result = await db.query.organizations.findFirst({
      where: (orgs, { eq: colEq }) => colEq(orgs.slug, slug),
    });

    if (!result) {
      return { success: false as const, error: 'Organisation non trouvée' };
    }

    // Only members of the org (or platform admins) can read its details.
    // canAccessOrg consolide les 3 sources RBAC (direct, group manager, team
    // grant) et court-circuite déjà sur is_superadmin, donc le check séparé
    // isUserAdmin devient redondant.
    if (!(await canAccessOrg(session.user.id, result.id))) {
      return { success: false as const, error: 'Accès non autorisé' };
    }

    return { success: true as const, data: result };
  } catch (error) {
    logger.error('Get organization failed', { error: String(error) });
    return { success: false as const, error: 'Erreur lors de la récupération' };
  }
}

export async function listOrganizations() {
  await requireAdmin();

  const result = await db.query.organizations.findMany({
    orderBy: (orgs, { desc }) => [desc(orgs.created_at)],
  });

  return result;
}
