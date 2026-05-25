'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  organization_responsibles,
  organizations as organizationsTable,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireAdmin } from '@/lib/auth/session';
import {
  addResponsibleSchema,
  updateResponsibleSchema,
  updateOrgLeadSchema,
} from '@/lib/validations/org-responsibles';
import { createAuditLog } from '@/lib/utils/audit';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { addMember } from '@/actions/members';

/**
 * Platform super-admin only.
 * List every client-side lead contact of an organization.
 */
export async function listOrgResponsibles(orgId: string) {
  try {
    await requireAdmin();
    const rows = await db
      .select({
        id: organization_responsibles.id,
        email: organization_responsibles.email,
        name: organization_responsibles.name,
        created_at: organization_responsibles.created_at,
      })
      .from(organization_responsibles)
      .where(eq(organization_responsibles.organization_id, orgId))
      .orderBy(organization_responsibles.created_at);
    return { success: true as const, data: rows };
  } catch (error) {
    logger.error('List org responsibles failed', { error: String(error) });
    return { success: false as const, error: 'Acces refuse ou erreur' };
  }
}

/**
 * Platform super-admin only.
 * Add a responsable (email + optional name) to an organization. Uniqueness
 * is enforced by the (organization_id, email) composite key at DB level.
 */
export async function addOrgResponsible(data: {
  organization_id: string;
  email: string;
  name?: string;
}) {
  try {
    const session = await requireAdmin();
    const validated = addResponsibleSchema.parse(data);

    const id = uuid();
    try {
      await db.insert(organization_responsibles).values({
        id,
        organization_id: validated.organization_id,
        email: validated.email,
        name: validated.name || null,
      });
    } catch (err) {
      const msg = String(err);
      if (msg.includes('unique_org_responsible_email') || msg.includes('duplicate key')) {
        return { success: false as const, error: 'Ce responsable est deja enregistre' };
      }
      throw err;
    }

    await createAuditLog({
      actorId: session.user.id,
      orgId: validated.organization_id,
      action: 'responsible_added',
      entityType: 'organization',
      entityId: validated.organization_id,
      changes: { email: validated.email, name: validated.name ?? null },
    });

    revalidatePath('/admin/clients', 'layout');
    return { success: true as const, data: { id } };
  } catch (error) {
    logger.error('Add org responsible failed', { error: String(error) });
    return { success: false as const, error: 'Erreur lors de l\'ajout' };
  }
}

/**
 * Platform super-admin only. Remove a responsable entry by id.
 */
export async function removeOrgResponsible(responsibleId: string) {
  try {
    const session = await requireAdmin();

    const [existing] = await db
      .select({
        id: organization_responsibles.id,
        email: organization_responsibles.email,
        orgId: organization_responsibles.organization_id,
      })
      .from(organization_responsibles)
      .where(eq(organization_responsibles.id, responsibleId))
      .limit(1);

    if (!existing) {
      return { success: false as const, error: 'Responsable introuvable' };
    }

    await db
      .delete(organization_responsibles)
      .where(eq(organization_responsibles.id, responsibleId));

    await createAuditLog({
      actorId: session.user.id,
      orgId: existing.orgId,
      action: 'responsible_removed',
      entityType: 'organization',
      entityId: existing.orgId,
      changes: { email: existing.email },
    });

    revalidatePath('/admin/clients', 'layout');
    return { success: true as const };
  } catch (error) {
    logger.error('Remove org responsible failed', { error: String(error) });
    return { success: false as const, error: 'Erreur lors de la suppression' };
  }
}

/**
 * Met à jour les infos d'un contact externe (organization_responsibles).
 * Superadmin only. L'unicité (organization_id, email) est garantie côté DB.
 */
export async function updateOrgResponsible(input: unknown) {
  try {
    const session = await requireAdmin();
    const parsed = updateResponsibleSchema.parse(input);

    const [existing] = await db
      .select({
        id: organization_responsibles.id,
        orgId: organization_responsibles.organization_id,
      })
      .from(organization_responsibles)
      .where(eq(organization_responsibles.id, parsed.responsible_id))
      .limit(1);
    if (!existing) {
      return { success: false as const, error: 'Responsable introuvable' };
    }

    try {
      await db
        .update(organization_responsibles)
        .set({ email: parsed.email, name: parsed.name })
        .where(eq(organization_responsibles.id, parsed.responsible_id));
    } catch (err) {
      const msg = String(err);
      if (msg.includes('unique_org_responsible_email') || msg.includes('duplicate key')) {
        return { success: false as const, error: 'Cet email est déjà utilisé pour ce client' };
      }
      throw err;
    }

    await createAuditLog({
      actorId: session.user.id,
      orgId: existing.orgId,
      action: 'responsible_updated',
      entityType: 'organization',
      entityId: existing.orgId,
      changes: { email: parsed.email, name: parsed.name },
    });

    revalidatePath('/admin/clients', 'layout');
    revalidatePath(`/clients/${existing.orgId}/members`);
    return { success: true as const };
  } catch (error) {
    logger.error('Update org responsible failed', { error: String(error) });
    return { success: false as const, error: "Erreur lors de la mise à jour" };
  }
}

/**
 * Met à jour le contact "lead" legacy (organizations.responsible_email/name).
 * Permet aussi de l'effacer en passant email=null. Superadmin only.
 */
export async function updateOrgLead(input: unknown) {
  try {
    const session = await requireAdmin();
    const parsed = updateOrgLeadSchema.parse(input);

    await db
      .update(organizationsTable)
      .set({
        responsible_email: parsed.email,
        responsible_name: parsed.email ? parsed.name : null,
        updated_at: new Date(),
      })
      .where(eq(organizationsTable.id, parsed.organization_id));

    await createAuditLog({
      actorId: session.user.id,
      orgId: parsed.organization_id,
      action: parsed.email ? 'org_lead_updated' : 'org_lead_cleared',
      entityType: 'organization',
      entityId: parsed.organization_id,
      changes: { email: parsed.email, name: parsed.name },
    });

    revalidatePath('/admin/clients', 'layout');
    revalidatePath(`/clients/${parsed.organization_id}/members`);
    return { success: true as const };
  } catch (error) {
    logger.error('Update org lead failed', { error: String(error) });
    return { success: false as const, error: "Erreur lors de la mise à jour" };
  }
}

const convertExternalSchema = z.object({
  organization_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['viewer', 'gestionnaire', 'admin']),
});

/**
 * Convertit un contact externe en invitation Pulseo : appelle `addMember` qui
 * crée un invite_link + envoie un mail (si l'email n'a pas de compte) ou
 * enrôle directement le user (s'il en a un). Superadmin only pour rester
 * cohérent avec le RBAC existant des actions org-responsibles.
 */
export async function convertExternalToInvite(input: unknown) {
  try {
    await requireAdmin();
    const parsed = convertExternalSchema.parse(input);
    await addMember({
      organization_id: parsed.organization_id,
      email: parsed.email,
      role: parsed.role,
    });
    revalidatePath(`/clients/${parsed.organization_id}/members`);
    return { success: true as const };
  } catch (error) {
    logger.error('Convert external to invite failed', { error: String(error) });
    const msg = error instanceof Error ? error.message : "Erreur lors de la conversion";
    return { success: false as const, error: msg };
  }
}
