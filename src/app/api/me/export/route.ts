import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Export RGPD art. 15 / 20 — JSON portable des données personnelles de
 * l'utilisateur authentifié.
 *
 * Exclusions explicites (mentionnées dans la politique de confidentialité) :
 * - audit_logs / proj_audit_logs : sécurité art. 32, communication restreinte
 *   par art. 15.4 (droits et libertés des tiers)
 * - sessions / accounts / verifications : tokens internes Better Auth
 * - secrets dérivés (password hash, TOTP) : non concernés
 *
 * Réponse : application/json + Content-Disposition attachment, filename
 * pulseo-donnees-<userId>-<YYYY-MM-DD>.json
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // 1. Profil
  const userRow = await db.query.users.findFirst({
    where: (u, { eq: eqOp }) => eqOp(u.id, userId),
    columns: {
      id: true,
      email: true,
      name: true,
      first_name: true,
      last_name: true,
      job_title: true,
      locale: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // 2. Memberships
  const memberships = await db
    .select({
      orgId: schema.organization_members.organization_id,
      orgSlug: schema.organizations.slug,
      orgName: schema.organizations.name,
      role: schema.organization_members.role,
      joinedAt: schema.organization_members.created_at,
    })
    .from(schema.organization_members)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.organization_members.organization_id),
    )
    .where(eq(schema.organization_members.user_id, userId));

  // 3. Tickets créés
  const tickets = await db
    .select({
      id: schema.tickets.id,
      number: schema.tickets.number,
      title: schema.tickets.title,
      description: schema.tickets.description,
      priority: schema.tickets.priority,
      category: schema.tickets.category,
      status: schema.tickets.status,
      location: schema.tickets.location,
      created_at: schema.tickets.created_at,
      updated_at: schema.tickets.updated_at,
      organization_id: schema.tickets.organization_id,
    })
    .from(schema.tickets)
    .where(eq(schema.tickets.creator_id, userId));

  // 4. Commentaires rédigés (auteur = user)
  const comments = await db
    .select({
      id: schema.ticket_comments.id,
      ticket_id: schema.ticket_comments.ticket_id,
      content: schema.ticket_comments.content,
      created_at: schema.ticket_comments.created_at,
    })
    .from(schema.ticket_comments)
    .where(eq(schema.ticket_comments.author_id, userId));

  // 5. Documents uploadés (metadata uniquement, pas de binaires)
  const documents = await db
    .select({
      id: schema.documents.id,
      organization_id: schema.documents.organization_id,
      title: schema.documents.title,
      filename: schema.documents.filename,
      mime_type: schema.documents.mime_type,
      file_size_bytes: schema.documents.file_size_bytes,
      created_at: schema.documents.created_at,
    })
    .from(schema.documents)
    .where(eq(schema.documents.uploaded_by_id, userId));

  // 6. User feedback rédigés
  const feedbacks = await db
    .select({
      id: schema.user_feedback.id,
      type: schema.user_feedback.type,
      title: schema.user_feedback.title,
      description: schema.user_feedback.description,
      status: schema.user_feedback.status,
      created_at: schema.user_feedback.created_at,
    })
    .from(schema.user_feedback)
    .where(eq(schema.user_feedback.user_id, userId));

  // 7. Demandes de suppression RGPD existantes (transparence)
  const deletionRequests = await db
    .select({
      id: schema.rgpd_deletion_requests.id,
      status: schema.rgpd_deletion_requests.status,
      requested_at: schema.rgpd_deletion_requests.requested_at,
      processed_at: schema.rgpd_deletion_requests.processed_at,
      reason: schema.rgpd_deletion_requests.reason,
    })
    .from(schema.rgpd_deletion_requests)
    .where(eq(schema.rgpd_deletion_requests.user_id, userId));

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    note: "Cet export contient les données personnelles vous concernant au sens de l'article 15 du RGPD. Les journaux de sécurité (audit_logs) ne sont pas inclus car leur conservation relève de l'obligation de sécurité (art. 32) et leur communication porterait atteinte aux droits et libertés des tiers (art. 15.4). Les sessions et tokens internes (accounts, verifications) sont également exclus pour des raisons de sécurité.",
    user: userRow,
    memberships,
    tickets,
    comments,
    documents,
    feedbacks,
    deletionRequests,
  };

  logger.info('RGPD export delivered', {
    userId,
    counts: {
      memberships: memberships.length,
      tickets: tickets.length,
      comments: comments.length,
      documents: documents.length,
      feedbacks: feedbacks.length,
      deletionRequests: deletionRequests.length,
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const filename = `pulseo-donnees-${userId}-${today}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
