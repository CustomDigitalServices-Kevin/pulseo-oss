import { Resend } from 'resend';
import { logger } from '@/lib/logger';
import { appConfig, getEmailFooterBrand } from '@/config/app-config';

/**
 * Distinguishable error class for email delivery failures.
 *
 * Use `sendEmailOrThrow` when missing the email = broken user flow (magic
 * links, password resets, account-recovery). The kill-switch
 * (`EMAIL_ENABLED=false`) and missing API key are also surfaced as
 * EmailError so callers fail fast in misconfigured prod environments.
 */
export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailError';
  }
}

/**
 * Lazily instantiated Resend client.
 *
 * Why lazy: the Resend SDK throws "Missing API key" when constructed with
 * an undefined key. We do not want this to crash the build or page-data
 * collection step on environments where Resend is not configured (CI,
 * staging, dev). Calls to sendEmail return a soft failure instead.
 */
let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (_resend) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  _resend = new Resend(apiKey);
  return _resend;
}

/**
 * Sender address for outgoing emails.
 *
 * Configurable via EMAIL_FROM env var. Falls back to Resend's onboarding
 * address which works without domain verification but can ONLY send to the
 * email of the Resend account owner. Set EMAIL_FROM to your verified
 * domain address (e.g. "App Name <noreply@your-domain.tld>") once the
 * domain is configured on Resend.
 */
function getFromAddress(): string {
  return process.env.EMAIL_FROM || `${appConfig.name} <onboarding@resend.dev>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  // Kill-switch global. Set EMAIL_ENABLED=false to silence all outgoing email
  // (useful during deploys, tests, or incidents). Default: true.
  if (process.env.EMAIL_ENABLED === 'false') {
    logger.info('EMAIL_ENABLED=false, skipping email', { to, subject });
    return { success: false as const, error: 'Email disabled' };
  }
  const client = getResend();
  if (!client) {
    logger.warn('RESEND_API_KEY not set, skipping email', { to, subject });
    return { success: false as const, error: 'Email service non configure' };
  }

  try {
    const result = await client.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
    });

    if (result.error) {
      logger.error('Resend API rejected email', {
        to,
        subject,
        from: getFromAddress(),
        statusCode: result.error.name,
        message: result.error.message,
      });
      return { success: false as const, error: result.error.message };
    }

    return { success: true as const, data: result.data };
  } catch (error) {
    logger.error('Failed to send email', { error: String(error), to, subject });
    return { success: false as const, error: 'Echec envoi email' };
  }
}

/**
 * Strict variant of `sendEmail` that throws `EmailError` on every failure
 * mode (kill-switch, missing API key, Resend rejection, network/library
 * error). Use this for emails whose absence breaks a user flow (magic
 * links, account-recovery, RGPD DPO notifications).
 *
 * Plain `sendEmail` returning a soft `{success: false}` remains the right
 * choice for best-effort notifications where a delivery failure should not
 * abort the surrounding action (e.g. ticket-created notifications).
 */
export async function sendEmailOrThrow(args: {
  to: string;
  subject: string;
  html: string;
}) {
  const result = await sendEmail(args);
  if (!result.success) {
    throw new EmailError(result.error);
  }
  return result.data;
}

export async function sendMagicLinkEmail(
  email: string,
  magicLink: string,
  organizationName: string
) {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('[DEV] Magic link generated', { email, magicLink });
    // Dev sans Resend: don't throw, the magic link is already in the dev log.
    // Throwing here would break local sign-in flows that legitimately have
    // no email backend configured.
    if (!process.env.RESEND_API_KEY) {
      return undefined;
    }
  }
  const appNameLower = appConfig.name.toLowerCase();
  const isAppName = organizationName.toLowerCase() === appNameLower;
  const safeOrgName = escapeHtml(organizationName);
  const safeLink = escapeHtml(magicLink);
  const safeAppName = escapeHtml(appConfig.name);
  const safePrimary = escapeHtml(appConfig.primaryColor);
  const subject = isAppName
    ? `Votre lien de connexion ${appConfig.name}`
    : `Lien d'accès ${appConfig.name} - ${organizationName}`;
  const heading = isAppName
    ? 'Votre lien de connexion'
    : `Bienvenue dans ${safeOrgName}`;

  return sendEmailOrThrow({
    to: email,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: ${safePrimary};">${heading}</h2>
        <p>Cliquez le lien ci-dessous pour accéder à votre espace client :</p>
        <p>
          <a href="${safeLink}" style="padding: 12px 24px; background-color: ${safePrimary}; color: white; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
            Accéder à ${safeAppName}
          </a>
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          Si vous n'avez pas demandé ce lien, ignorez cet email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 11px;">
          ${escapeHtml(getEmailFooterBrand())}
        </p>
      </div>
    `,
  });
}
