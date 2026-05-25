import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { sendEmail, escapeHtml } from './index';
import { logger } from '@/lib/logger';
import { appConfig } from '@/config/app-config';

interface FeedbackNotificationPayload {
  feedbackId: string;
  type: 'feature' | 'bug';
  title: string;
  description: string;
  userName: string | null;
  userEmail: string;
  organizationName?: string | null;
}

/**
 * Notifie tous les superadmins d'une nouvelle soumission de feedback user.
 *
 * Best-effort : échoue silencieusement si Resend n'est pas configuré ou si
 * un superadmin n'a pas d'email valide. Les erreurs sont loggées mais ne
 * remontent pas côté caller (le feedback reste enregistré en DB, l'admin
 * peut toujours le voir dans /admin/feedback).
 */
export async function notifySuperadminsOfFeedback(
  payload: FeedbackNotificationPayload,
): Promise<void> {
  const superadmins = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.is_superadmin, true));

  if (superadmins.length === 0) {
    logger.warn('No superadmin configured for feedback notification', {
      feedbackId: payload.feedbackId,
    });
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? appConfig.appUrl;
  const adminUrl = `${baseUrl}/admin/feedback`;

  const typeLabel = payload.type === 'bug' ? 'Bug' : 'Amélioration';
  const typeColor = payload.type === 'bug' ? '#e11d48' : '#8b5cf6';

  const subject = `[${appConfig.name} Feedback · ${typeLabel}] ${payload.title}`;
  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, system-ui, sans-serif; background: #18181b; color: #e4e4e7; margin: 0; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background: #27272a; border: 1px solid #3f3f46; border-radius: 12px; overflow: hidden;">
      <div style="padding: 20px 24px; border-bottom: 1px solid #3f3f46;">
        <span style="display: inline-block; padding: 4px 10px; border-radius: 999px; background: ${typeColor}20; color: ${typeColor}; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
          ${escapeHtml(typeLabel)}
        </span>
        <h1 style="font-size: 18px; margin: 10px 0 0; font-weight: 600;">${escapeHtml(payload.title)}</h1>
      </div>
      <div style="padding: 20px 24px;">
        <p style="margin: 0 0 16px; font-size: 13px; color: #a1a1aa;">
          De <strong style="color: #e4e4e7;">${escapeHtml(payload.userName ?? payload.userEmail)}</strong>
          &lt;${escapeHtml(payload.userEmail)}&gt;
          ${payload.organizationName ? `· Org ${escapeHtml(payload.organizationName)}` : ''}
        </p>
        <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 8px; padding: 14px; font-size: 14px; line-height: 1.55; white-space: pre-wrap;">${escapeHtml(payload.description)}</div>
      </div>
      <div style="padding: 16px 24px; border-top: 1px solid #3f3f46; background: #18181b;">
        <a href="${adminUrl}" style="display: inline-block; padding: 8px 14px; border-radius: 6px; background: #2563eb; color: #fff; text-decoration: none; font-size: 13px; font-weight: 500;">Ouvrir /admin/feedback</a>
      </div>
    </div>
  </body>
</html>`;

  // Un seul envoi par superadmin, en best-effort. On pourrait agréger vers une
  // mailing-list `feedback@` plus tard si le volume augmente. Pour l'instant,
  // 1-2 superadmins typiquement, envoi direct OK.
  for (const sa of superadmins) {
    if (!sa.email) continue;
    const res = await sendEmail({ to: sa.email, subject, html });
    if (!res.success) {
      logger.warn('Superadmin feedback notification failed', {
        feedbackId: payload.feedbackId,
        to: sa.email,
        error: res.error,
      });
    }
  }
}
