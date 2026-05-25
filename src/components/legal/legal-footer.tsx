import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

interface LegalFooterProps {
  variant?: 'default' | 'auth';
}

export async function LegalFooter({ variant = 'default' }: LegalFooterProps) {
  const t = await getTranslations('legal.footer');
  const isAuth = variant === 'auth';
  return (
    <footer
      className={
        isAuth
          ? 'mt-8 pt-4 border-t border-border text-[12px] text-foreground-subtle'
          : 'mt-12 pt-6 pb-6 px-6 border-t border-border text-[12px] text-foreground-subtle'
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Link href="/mentions-legales" className="hover:text-foreground transition-colors">
          {t('legalNotice')}
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          href="/politique-de-confidentialite"
          className="hover:text-foreground transition-colors"
        >
          {t('privacyPolicy')}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/cookies" className="hover:text-foreground transition-colors">
          {t('cookies')}
        </Link>
        {!isAuth && (
          <>
            <span aria-hidden="true">·</span>
            <Link href="/me/rgpd" className="hover:text-foreground transition-colors">
              {t('myData')}
            </Link>
          </>
        )}
      </div>
      <p
        className="mt-3 text-center"
        title={t('hostingTooltip')}
      >
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-canvas/60 text-foreground-muted text-[11px]"
        >
          <FrenchFlag />
          <span>{t('hostingFrance')}</span>
        </span>
      </p>
      <p className="mt-2 text-center text-foreground-subtle/70">{t('copyright')}</p>
    </footer>
  );
}

/**
 * Drapeau français en SVG inline (3 bandes verticales bleu/blanc/rouge,
 * proportions officielles 2:3). Préféré à l'emoji 🇫🇷 pour rendu cohérent
 * cross-OS (certains Windows ne rendent pas les flag emojis).
 */
function FrenchFlag() {
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 3 2"
      role="img"
      aria-label="Drapeau de la France"
      className="rounded-[1px] shrink-0"
    >
      <rect width="1" height="2" x="0" fill="#0055A4" />
      <rect width="1" height="2" x="1" fill="#FFFFFF" />
      <rect width="1" height="2" x="2" fill="#EF4135" />
    </svg>
  );
}
