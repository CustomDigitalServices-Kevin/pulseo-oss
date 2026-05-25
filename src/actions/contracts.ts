'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { contracts, audit_logs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
  createContractSchema,
  updateContractSchema,
  terminateContractSchema,
} from '@/lib/validations/contracts';
import { requireSession } from '@/lib/auth/session';
import { requireEffectiveRole, RoleError } from '@/lib/auth/require-role';
import { canAccessOrg } from '@/lib/auth/permissions';
import { Contract } from '@/types';
import { logger } from '@/lib/logger';

interface ActionResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function createContract(
  data: unknown
): Promise<ActionResult<Contract>> {
  try {
    const session = await requireSession();
    const validated = createContractSchema.parse(data);

    const org = await db.query.organizations.findFirst({
      where: (orgs, { eq }) => eq(orgs.id, validated.organization_id),
    });

    if (!org) {
      return { success: false, error: 'Organisation non trouvee' };
    }

    // Only gestionnaires and admins can create contracts.
    await requireEffectiveRole(session.user.id, validated.organization_id, 'gestionnaire');

    const contractId = uuid();
    const [newContract] = await db
      .insert(contracts)
      .values({
        id: contractId,
        organization_id: validated.organization_id,
        name: validated.name,
        description: validated.description || null,
        status: 'active',
        quota_hours: validated.quota_hours,
        consumed_hours: '0',
        rate_per_hour: validated.rate_per_hour,
        sla_response_hours: validated.sla_response_hours ?? null,
        sla_resolution_hours: validated.sla_resolution_hours ?? null,
        start_date: validated.start_date,
        end_date: validated.end_date,
      })
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: validated.organization_id,
      entity_type: 'contract',
      entity_id: contractId,
      action: 'created',
      actor_id: session.user.id,
      changes: {
        name: validated.name,
        quota_hours: validated.quota_hours,
        rate_per_hour: validated.rate_per_hour,
        sla_response_hours: validated.sla_response_hours,
        sla_resolution_hours: validated.sla_resolution_hours,
      },
    });

    revalidatePath('/clients', 'layout');
    return { success: true, data: newContract };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Create contract failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la creation du contrat',
    };
  }
}

export async function updateContract(
  contractId: string,
  data: unknown
): Promise<ActionResult<Contract>> {
  try {
    const session = await requireSession();
    const validated = updateContractSchema.parse(data);

    const existing = await db.query.contracts.findFirst({
      where: (c, { eq }) => eq(c.id, contractId),
    });

    if (!existing) {
      return { success: false, error: 'Contrat non trouve' };
    }

    // Only gestionnaires and admins can update contracts.
    await requireEffectiveRole(session.user.id, existing.organization_id, 'gestionnaire');

    // Sanity check: consumed_hours must not exceed the new quota
    if (validated.quota_hours !== undefined) {
      const newQuota = parseFloat(validated.quota_hours);
      const currentConsumed = parseFloat(existing.consumed_hours);
      if (Number.isFinite(newQuota) && Number.isFinite(currentConsumed) && currentConsumed > newQuota) {
        return {
          success: false,
          error: `Le quota ne peut pas etre inferieur aux heures deja consommees (${currentConsumed.toFixed(2)} h)`,
        };
      }
    }

    const updateData: Partial<typeof contracts.$inferInsert> = { updated_at: new Date() };
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.quota_hours !== undefined) updateData.quota_hours = validated.quota_hours;
    if (validated.rate_per_hour !== undefined) updateData.rate_per_hour = validated.rate_per_hour;
    if (validated.sla_response_hours !== undefined)
      updateData.sla_response_hours = validated.sla_response_hours;
    if (validated.sla_resolution_hours !== undefined)
      updateData.sla_resolution_hours = validated.sla_resolution_hours;
    if (validated.start_date !== undefined) updateData.start_date = validated.start_date;
    if (validated.end_date !== undefined) updateData.end_date = validated.end_date;

    const [updatedContract] = await db
      .update(contracts)
      .set(updateData)
      .where(eq(contracts.id, contractId))
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: existing.organization_id,
      entity_type: 'contract',
      entity_id: contractId,
      action: 'updated',
      actor_id: session.user.id,
      changes: validated,
    });

    revalidatePath('/clients', 'layout');
    return { success: true, data: updatedContract };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Update contract failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la mise a jour du contrat',
    };
  }
}

export async function terminateContract(
  data: unknown
): Promise<ActionResult<Contract>> {
  try {
    const session = await requireSession();
    const validated = terminateContractSchema.parse(data);

    const contract = await db.query.contracts.findFirst({
      where: (c, { eq }) => eq(c.id, validated.contract_id),
    });

    if (!contract) {
      return { success: false, error: 'Contrat non trouve' };
    }

    // Only gestionnaires and admins can terminate contracts.
    await requireEffectiveRole(session.user.id, contract.organization_id, 'gestionnaire');

    const [terminated] = await db
      .update(contracts)
      .set({
        status: 'terminated',
        updated_at: new Date(),
      })
      .where(eq(contracts.id, validated.contract_id))
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: contract.organization_id,
      entity_type: 'contract',
      entity_id: contract.id,
      action: 'terminated',
      actor_id: session.user.id,
    });

    revalidatePath('/clients', 'layout');
    return { success: true, data: terminated };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Terminate contract failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la resiliation du contrat',
    };
  }
}

export async function getContractsByOrganization(
  organizationId: string
): Promise<ActionResult<Contract[]>> {
  try {
    const session = await requireSession();

    // Read access: any user with an effective role on the org can list contracts.
    if (!(await canAccessOrg(session.user.id, organizationId))) {
      return { success: false, error: 'Acces non autorise' };
    }

    const contractList = await db.query.contracts.findMany({
      where: (c, { eq }) => eq(c.organization_id, organizationId),
      orderBy: (c, { desc }) => [desc(c.created_at)],
    });

    return { success: true, data: contractList };
  } catch (error) {
    logger.error('Get contracts failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la recuperation des contrats',
    };
  }
}
