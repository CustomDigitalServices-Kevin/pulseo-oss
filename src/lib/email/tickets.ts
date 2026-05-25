import { sendEmail, escapeHtml } from './index';
import { Ticket } from '@/types';
import { appConfig, getServerAppUrl, getEmailFooterBrand } from '@/config/app-config';

const APP_URL = getServerAppUrl();

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  in_progress: 'En cours',
  waiting_client: 'En attente client',
  resolved: 'Resolu',
  closed: 'Ferme',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
};

export type TicketEmailType = 'created' | 'updated' | 'status_changed' | 'closed' | 'commented';

interface SendTicketNotificationArgs {
  type: TicketEmailType;
  ticket: Ticket;
  creatorEmail?: string;
  /** Slug of the ticket's organization — used to build the deep link. */
  orgSlug?: string | null;
  /** Display name of the actor who triggered the event. */
  actorName?: string | null;
  /** Content summary when `type === 'commented'` (first ~200 chars). */
  commentPreview?: string | null;
  /** Keys of ticket fields changed when `type === 'updated'`. */
  changedFields?: string[];
}

function buildTicketUrl(ticket: Ticket, orgSlug?: string | null): string {
  if (orgSlug) {
    return `${APP_URL}/clients/${encodeURIComponent(orgSlug)}/tickets/${ticket.id}`;
  }
  return `${APP_URL}/clients`;
}

function htmlShell(inner: string, ticket: Ticket, orgSlug?: string | null): string {
  const url = buildTicketUrl(ticket, orgSlug);
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #0f172a;">
      ${inner}
      <p style="margin-top: 24px;">
        <a href="${url}" style="display:inline-block;padding:10px 18px;background:#2563EB;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">
          Ouvrir le ticket
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="color:#999;font-size:11px;">${escapeHtml(getEmailFooterBrand())} — <a href="${APP_URL}" style="color:${escapeHtml(appConfig.primaryColor)};">${escapeHtml(APP_URL.replace(/^https?:\/\//, ''))}</a></p>
    </div>
  `;
}

export async function sendTicketNotificationEmail({
  type,
  ticket,
  creatorEmail,
  orgSlug,
  actorName,
  commentPreview,
  changedFields,
}: SendTicketNotificationArgs & { actorEmail?: string }) {
  let subject = '';
  let inner = '';

  const safeTitle = escapeHtml(ticket.title);
  const statusLabel = escapeHtml(STATUS_LABELS[ticket.status] ?? ticket.status);
  const priorityLabel = escapeHtml(PRIORITY_LABELS[ticket.priority] ?? ticket.priority);
  const actor = actorName ? escapeHtml(actorName) : null;

  switch (type) {
    case 'created':
      subject = `[${appConfig.name}] Nouveau ticket #${ticket.number} — ${ticket.title.slice(0, 60)}`;
      inner = `
        <h2 style="color:#2563EB;margin:0 0 12px;">Nouveau ticket #${ticket.number}</h2>
        <p style="margin:0 0 8px;">${actor ? `<strong>${actor}</strong> a cree un ticket` : 'Un nouveau ticket a ete cree'} :</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:12px 0;">
          <p style="margin:0 0 6px;font-weight:600;">${safeTitle}</p>
          <p style="margin:0;color:#475569;font-size:13px;">Priorite : <strong>${priorityLabel}</strong> · Statut : <strong>${statusLabel}</strong></p>
        </div>
      `;
      break;
    case 'updated': {
      const fields = (changedFields ?? []).filter(Boolean);
      const fieldsStr = fields.length ? fields.join(', ') : 'informations';
      subject = `[${appConfig.name}] Ticket #${ticket.number} mis a jour (${fieldsStr})`;
      inner = `
        <h2 style="color:#2563EB;margin:0 0 12px;">Ticket #${ticket.number} mis a jour</h2>
        <p style="margin:0 0 8px;">${actor ? `<strong>${actor}</strong> a modifie` : 'Modification apportee'} : <strong>${escapeHtml(fieldsStr)}</strong></p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:12px 0;">
          <p style="margin:0 0 6px;font-weight:600;">${safeTitle}</p>
          <p style="margin:0;color:#475569;font-size:13px;">Priorite : <strong>${priorityLabel}</strong> · Statut : <strong>${statusLabel}</strong></p>
        </div>
      `;
      break;
    }
    case 'status_changed':
      subject = `[${appConfig.name}] Ticket #${ticket.number} — statut ${STATUS_LABELS[ticket.status] ?? ticket.status}`;
      inner = `
        <h2 style="color:#2563EB;margin:0 0 12px;">Statut mis a jour</h2>
        <p style="margin:0 0 8px;">${actor ? `<strong>${actor}</strong> a passe le ticket` : 'Le ticket est passe'} en <strong>${statusLabel}</strong>.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:12px 0;">
          <p style="margin:0 0 6px;font-weight:600;">#${ticket.number} — ${safeTitle}</p>
          <p style="margin:0;color:#475569;font-size:13px;">Priorite : <strong>${priorityLabel}</strong></p>
        </div>
      `;
      break;
    case 'closed':
      subject = `[${appConfig.name}] Ticket #${ticket.number} ferme`;
      inner = `
        <h2 style="color:#2563EB;margin:0 0 12px;">Ticket ferme</h2>
        <p style="margin:0 0 8px;">${actor ? `<strong>${actor}</strong> a ferme` : 'Le ticket a ete ferme'} : <strong>#${ticket.number} — ${safeTitle}</strong></p>
      `;
      break;
    case 'commented': {
      const preview = commentPreview
        ? escapeHtml(commentPreview.length > 280 ? commentPreview.slice(0, 280) + '…' : commentPreview)
        : '';
      subject = `[${appConfig.name}] Nouveau commentaire sur #${ticket.number}`;
      inner = `
        <h2 style="color:#2563EB;margin:0 0 12px;">Nouveau commentaire</h2>
        <p style="margin:0 0 8px;">${actor ? `<strong>${actor}</strong> a commente` : 'Nouveau commentaire'} sur le ticket <strong>#${ticket.number} — ${safeTitle}</strong>.</p>
        ${preview ? `<blockquote style="background:#f8fafc;border-left:3px solid #2563EB;padding:10px 14px;margin:12px 0;color:#334155;font-size:13px;white-space:pre-wrap;">${preview}</blockquote>` : ''}
      `;
      break;
    }
  }

  const to = creatorEmail;
  if (!to) return;
  await sendEmail({ to, subject, html: htmlShell(inner, ticket, orgSlug) });
}
