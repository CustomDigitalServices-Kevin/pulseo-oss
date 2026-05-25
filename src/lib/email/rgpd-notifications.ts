import { sendEmail, escapeHtml } from './index';
import { logger } from '@/lib/logger';

interface DeletionRequestPayload {
  requestId: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  reason: string | null;
  requestedAt: Date;
}

/**
 * Envoie au DPO/contact vie privée une notification de nouvelle demande de
 * suppression de compte (art. 17 RGPD).
 *
 * Best-effort : si Resend KO ou DPO_EMAIL absent, log warn mais la demande
 * reste en DB (visible via SQL ou future page admin).
 *
 * Le DPO traite manuellement (anonymisation user + tickets/comments selon
 * politique de conservation) puis met à jour le status via SQL ou UI admin.
 */
export async function notifyDpoOfDeletionRequest(
  payload: DeletionRequestPayload,
): Promise<void> {
  const dpoEmail = process.env.DPO_EMAIL;
  if (!dpoEmail) {
    logger.warn('DPO_EMAIL not configured, skipping deletion request notification', {
      requestId: payload.requestId,
    });
    return;
  }

  const subject = `[Pulseo RGPD] Nouvelle demande de suppression de compte`;
  const requestedAtFr = payload.requestedAt.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, system-ui, sans-serif; background: #18181b; color: #e4e4e7; margin: 0; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background: #27272a; border: 1px solid #3f3f46; border-radius: 12px; overflow: hidden;">
      <div style="padding: 20px 24px; border-bottom: 1px solid #3f3f46;">
        <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa;">
          Pulseo · Demande RGPD
        </p>
        <h1 style="margin: 6px 0 0 0; font-size: 18px; color: #fafafa;">
          Suppression de compte à traiter
        </h1>
      </div>
      <div style="padding: 20px 24px; font-size: 14px; line-height: 1.6;">
        <p style="margin: 0 0 12px 0;"><strong>Utilisateur :</strong> ${escapeHtml(payload.userName ?? '(sans nom)')} &lt;${escapeHtml(payload.userEmail)}&gt;</p>
        <p style="margin: 0 0 12px 0;"><strong>User ID :</strong> <code style="background: #18181b; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${escapeHtml(payload.userId)}</code></p>
        <p style="margin: 0 0 12px 0;"><strong>Request ID :</strong> <code style="background: #18181b; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${escapeHtml(payload.requestId)}</code></p>
        <p style="margin: 0 0 12px 0;"><strong>Demandée le :</strong> ${escapeHtml(requestedAtFr)} (Europe/Paris)</p>
        ${
          payload.reason
            ? `<div style="margin: 16px 0; padding: 12px; background: #18181b; border-left: 3px solid #8b5cf6; border-radius: 4px;">
                 <p style="margin: 0 0 4px 0; font-size: 12px; color: #a1a1aa;">Motif fourni :</p>
                 <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(payload.reason)}</p>
               </div>`
            : '<p style="margin: 12px 0; color: #a1a1aa; font-style: italic;">Aucun motif fourni.</p>'
        }
        <hr style="border: none; border-top: 1px solid #3f3f46; margin: 20px 0;" />
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #a1a1aa;">
          Délai légal de réponse : 1 mois (extensible 3 mois en cas de complexité, art. 12.3 RGPD).
        </p>
        <p style="margin: 0; font-size: 13px; color: #a1a1aa;">
          Action manuelle : contacter l'utilisateur, anonymiser le compte selon la politique de conservation,
          mettre à jour <code style="background: #18181b; padding: 1px 4px; border-radius: 3px;">rgpd_deletion_requests.status</code>.
        </p>
      </div>
    </div>
  </body>
</html>`;

  const result = await sendEmail({
    to: dpoEmail,
    subject,
    html,
  });

  if (!result.success) {
    logger.warn('Failed to send DPO deletion request notification', {
      requestId: payload.requestId,
      error: result.error,
    });
  } else {
    logger.info('DPO notified of deletion request', {
      requestId: payload.requestId,
      dpoEmail,
    });
  }
}
