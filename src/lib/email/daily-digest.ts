import { db } from '@/lib/db';
import { tickets, organizations } from '@/lib/db/schema';
import { and, inArray, asc, desc } from 'drizzle-orm';
import { sendEmail, escapeHtml } from '@/lib/email';
import { getSuperadminEmails } from '@/lib/email/notifications';
import { computeSlaStatus } from '@/lib/sla';
import { logger } from '@/lib/logger';
import { appConfig, getServerAppUrl, getEmailFooterBrand } from '@/config/app-config';

const APP_URL = getServerAppUrl();

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critique',
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  in_progress: 'En cours',
  waiting_client: 'En attente',
  resolved: 'Resolu',
  closed: 'Ferme',
};

const SLA_LABELS: Record<string, string> = {
  overdue: '🔴 En retard',
  at_risk: '🟠 À risque',
  on_time: '🟢 OK',
  met: '✅ Respecté',
  no_sla: '—',
};

interface TicketDigestRow {
  id: string;
  number: number;
  title: string;
  priority: string;
  status: string;
  created_at: Date;
  resolution_due_at: Date | null;
  closed_at: Date | null;
}

interface OrgDigest {
  id: string;
  name: string;
  slug: string;
  openTickets: TicketDigestRow[];
}

export interface DailyDigestResult {
  sentTo: string[];
  orgCount: number;
  totalOpenTickets: number;
  skippedReason?: string;
}

/**
 * Collect every open ticket (status != closed) per organization, then
 * build and send ONE consolidated email per super-admin recipient.
 *
 * "Open" = any ticket not in `closed` status; we still surface `resolved`
 * tickets because they may be re-opened if the client objects. The email
 * is structured as sections (one per org) sorted by most tickets first.
 */
export async function sendDailyDigest(now: Date = new Date()): Promise<DailyDigestResult> {
  const recipients = await getSuperadminEmails();
  if (recipients.length === 0) {
    logger.warn('Daily digest skipped — no superadmin recipients');
    return { sentTo: [], orgCount: 0, totalOpenTickets: 0, skippedReason: 'no_recipients' };
  }

  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .orderBy(asc(organizations.name));

  if (orgs.length === 0) {
    return { sentTo: [], orgCount: 0, totalOpenTickets: 0, skippedReason: 'no_orgs' };
  }

  const rows = await db
    .select({
      id: tickets.id,
      organization_id: tickets.organization_id,
      number: tickets.number,
      title: tickets.title,
      priority: tickets.priority,
      status: tickets.status,
      created_at: tickets.created_at,
      resolution_due_at: tickets.resolution_due_at,
      closed_at: tickets.closed_at,
    })
    .from(tickets)
    .where(
      and(
        inArray(
          tickets.organization_id,
          orgs.map((o) => o.id)
        ),
        inArray(tickets.status, ['new', 'in_progress', 'waiting_client', 'resolved'])
      )
    )
    .orderBy(desc(tickets.created_at));

  const byOrg = new Map<string, TicketDigestRow[]>();
  for (const r of rows) {
    const list = byOrg.get(r.organization_id) ?? [];
    list.push(r);
    byOrg.set(r.organization_id, list);
  }

  const orgDigests: OrgDigest[] = orgs
    .map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      openTickets: (byOrg.get(o.id) ?? []).sort(
        (a, b) =>
          (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
          a.created_at.getTime() - b.created_at.getTime()
      ),
    }))
    .filter((o) => o.openTickets.length > 0)
    .sort((a, b) => b.openTickets.length - a.openTickets.length);

  if (orgDigests.length === 0) {
    // Nothing to report — still send a brief "all clear" email so the
    // platform operator knows the digest job runs, rather than worrying
    // about silent failure.
    const html = allClearHtml(now);
    for (const to of recipients) {
      await sendEmail({
        to,
        subject: `[${appConfig.name}] Digest quotidien — aucun ticket ouvert (${fmtDateFr(now)})`,
        html,
      });
    }
    return { sentTo: recipients, orgCount: 0, totalOpenTickets: 0 };
  }

  const totalOpen = orgDigests.reduce((s, o) => s + o.openTickets.length, 0);
  const html = digestHtml(orgDigests, now);
  const subject = `[${appConfig.name}] Digest quotidien — ${totalOpen} ticket${totalOpen > 1 ? 's' : ''} ouvert${totalOpen > 1 ? 's' : ''} (${fmtDateFr(now)})`;

  for (const to of recipients) {
    await sendEmail({ to, subject, html });
  }

  return { sentTo: recipients, orgCount: orgDigests.length, totalOpenTickets: totalOpen };
}

function fmtDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function allClearHtml(now: Date): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
      <h2 style="color:#16a34a;margin:0 0 12px;">✅ Aucun ticket ouvert</h2>
      <p style="margin:0 0 8px;">Digest du ${escapeHtml(fmtDateFr(now))} — rien a signaler, toutes les organisations ont leurs tickets fermes ou sans retour attendu.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="color:#999;font-size:11px;">${escapeHtml(getEmailFooterBrand())} — <a href="${APP_URL}" style="color:${escapeHtml(appConfig.primaryColor)};">${escapeHtml(APP_URL.replace(/^https?:\/\//, ''))}</a></p>
    </div>
  `;
}

function digestHtml(orgDigests: OrgDigest[], now: Date): string {
  const totalOpen = orgDigests.reduce((s, o) => s + o.openTickets.length, 0);
  const sections = orgDigests.map((o) => orgSectionHtml(o, now)).join('');

  return `
    <div style="font-family:sans-serif;max-width:720px;margin:0 auto;color:#0f172a;">
      <h2 style="color:${escapeHtml(appConfig.primaryColor)};margin:0 0 4px;">Digest quotidien — ${escapeHtml(appConfig.name)}</h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:13px;">
        ${escapeHtml(fmtDateFr(now))} · <strong>${totalOpen}</strong> ticket${totalOpen > 1 ? 's' : ''} ouvert${totalOpen > 1 ? 's' : ''} sur <strong>${orgDigests.length}</strong> organisation${orgDigests.length > 1 ? 's' : ''}
      </p>
      ${sections}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="color:#999;font-size:11px;">${escapeHtml(getEmailFooterBrand())} — <a href="${APP_URL}" style="color:${escapeHtml(appConfig.primaryColor)};">${escapeHtml(APP_URL.replace(/^https?:\/\//, ''))}</a></p>
    </div>
  `;
}

function orgSectionHtml(org: OrgDigest, now: Date): string {
  const rows = org.openTickets.map((t) => ticketRowHtml(t, org.slug, now)).join('');
  return `
    <div style="margin:24px 0;">
      <h3 style="margin:0 0 10px;font-size:16px;color:#0f172a;">
        ${escapeHtml(org.name)}
        <span style="color:#64748b;font-weight:400;font-size:13px;">— ${org.openTickets.length} ticket${org.openTickets.length > 1 ? 's' : ''}</span>
      </h3>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f1f5f9;color:#475569;">
            <th align="left" style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">#</th>
            <th align="left" style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">Titre</th>
            <th align="left" style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">Priorité</th>
            <th align="left" style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">Statut</th>
            <th align="left" style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">SLA</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function ticketRowHtml(t: TicketDigestRow, slug: string, now: Date): string {
  const url = `${APP_URL}/clients/${encodeURIComponent(slug)}/tickets/${t.id}`;
  const sla = computeSlaStatus(t.created_at, t.resolution_due_at, t.closed_at, now);
  return `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;font-family:monospace;">#${t.number}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">
        <a href="${url}" style="color:#2563EB;text-decoration:none;">${escapeHtml(t.title)}</a>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${escapeHtml(PRIORITY_LABELS[t.priority] ?? t.priority)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${escapeHtml(STATUS_LABELS[t.status] ?? t.status)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${SLA_LABELS[sla.status] ?? '—'}</td>
    </tr>
  `;
}
