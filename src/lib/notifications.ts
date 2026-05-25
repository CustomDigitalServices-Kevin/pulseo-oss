import { db } from '@/lib/db';
import { audit_logs, organization_members, organizations, tickets, users } from '@/lib/db/schema';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

export interface NotificationItem {
  id: string;
  title: string;
  description?: string;
  time: string;
  createdAt: Date;
  unread?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  created: 'Création',
  updated: 'Mise à jour',
  status_changed: 'Statut modifié',
  closed: 'Fermé',
  deleted: 'Supprimé',
  contract_assigned: 'Contrat assigné',
  time_updated: 'Temps mis à jour',
  tags_updated: 'Tags modifiés',
  bulk_status_changed: 'Statut en masse',
  uploaded: 'Upload',
  revoked: 'Révoqué',
  terminated: 'Résilié',
};

const ENTITY_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  contract: 'Contrat',
  comment: 'Commentaire',
  attachment: 'Pièce jointe',
  document: 'Document',
  organization: 'Organisation',
  invite_link: 'Lien d\'invitation',
  magic_link: 'Lien magique',
};

/**
 * Return recent audit-log entries for all organizations the user belongs to,
 * shaped for the notifications dropdown. The caller (server component)
 * invokes this; the dropdown component just renders the array.
 *
 * Self-authored actions are excluded so users don't see their own clicks
 * as notifications.
 */
export async function getRecentNotifications(
  userId: string,
  limit = 10
): Promise<NotificationItem[]> {
  const memberOrgs = await db
    .select({ orgId: organization_members.organization_id })
    .from(organization_members)
    .where(eq(organization_members.user_id, userId));

  const orgIds = memberOrgs.map((m) => m.orgId);
  if (orgIds.length === 0) return [];

  const rows = await db
    .select({
      id: audit_logs.id,
      action: audit_logs.action,
      entity_type: audit_logs.entity_type,
      entity_id: audit_logs.entity_id,
      created_at: audit_logs.created_at,
      actor_id: audit_logs.actor_id,
      actor_name: users.name,
      actor_email: users.email,
      org_name: organizations.name,
    })
    .from(audit_logs)
    .leftJoin(users, eq(users.id, audit_logs.actor_id))
    .leftJoin(organizations, eq(organizations.id, audit_logs.organization_id))
    .where(
      and(
        inArray(audit_logs.organization_id, orgIds),
        ne(audit_logs.actor_id, userId)
      )
    )
    .orderBy(desc(audit_logs.created_at))
    .limit(limit);

  if (rows.length === 0) return [];

  // Pull ticket numbers/titles for the ticket entities referenced.
  const ticketIds = rows
    .filter((r) => r.entity_type === 'ticket')
    .map((r) => r.entity_id);
  const ticketInfo = ticketIds.length
    ? await db
        .select({ id: tickets.id, number: tickets.number, title: tickets.title })
        .from(tickets)
        .where(inArray(tickets.id, ticketIds))
    : [];
  const ticketMap = new Map(ticketInfo.map((t) => [t.id, t]));

  return rows.map((r) => {
    const entityLabel = ENTITY_LABELS[r.entity_type] ?? r.entity_type;
    const actionLabel = ACTION_LABELS[r.action] ?? r.action;
    const ticket = r.entity_type === 'ticket' ? ticketMap.get(r.entity_id) : undefined;
    const titleTicket = ticket ? ` #${ticket.number}` : '';
    const actor = r.actor_name || r.actor_email || 'Inconnu';
    const org = r.org_name ? ` — ${r.org_name}` : '';

    return {
      id: r.id,
      title: `${actionLabel} · ${entityLabel}${titleTicket}`,
      description: ticket?.title ? `${actor}: ${ticket.title}${org}` : `${actor}${org}`,
      time: formatRelativeFr(r.created_at),
      createdAt: r.created_at,
    };
  });
}

function formatRelativeFr(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'à l\'instant';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
