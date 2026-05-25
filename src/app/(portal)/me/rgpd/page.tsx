import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Download, Shield, FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth/session';
import { listMyDeletionRequests } from '@/actions/rgpd';
import { RgpdActions } from '@/components/me/rgpd-actions';
import { appConfig } from '@/config/app-config';

export const metadata: Metadata = {
  title: 'Mes données (RGPD)',
};

export default async function MeRgpdPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const t = await getTranslations('rgpd');
  const requests = await listMyDeletionRequests();

  // Sérialise les Date pour le client component
  const initialRequests = requests.map((r) => ({
    id: r.id,
    status: r.status,
    requested_at: r.requested_at.toISOString(),
    processed_at: r.processed_at ? r.processed_at.toISOString() : null,
  }));

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-10 space-y-8">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
            {t('pageTitle')}
          </h1>
          <p className="text-[13px] text-foreground-muted mt-1 max-w-xl">{t('pageIntro')}</p>
        </div>
      </header>

      {/* Section export */}
      <section className="rounded-lg border border-border bg-canvas p-5">
        <header className="flex items-start gap-3 mb-3">
          <Download className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="text-[16px] font-semibold text-foreground">{t('exportTitle')}</h2>
            <p className="text-[13px] text-foreground-muted mt-1 leading-relaxed">
              {t('exportIntro')}
            </p>
          </div>
        </header>
        <a
          href="/api/me/export"
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
          download
        >
          <Download className="w-3.5 h-3.5" />
          {t('exportDownload')}
        </a>
        <p className="mt-3 text-[12px] text-foreground-subtle leading-relaxed">
          {t('exportExclusionsNote')}
        </p>
      </section>

      {/* Section droits */}
      <section className="rounded-lg border border-border bg-canvas p-5">
        <header className="flex items-start gap-3 mb-3">
          <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <h2 className="text-[16px] font-semibold text-foreground">{t('rightsTitle')}</h2>
        </header>
        <ul className="space-y-2 text-[13px] text-foreground-muted leading-relaxed list-disc pl-5">
          <li>{t('rightAccess')}</li>
          <li>{t('rightRectification')}</li>
          <li>{t('rightErasure')}</li>
          <li>{t('rightLimitation')}</li>
          <li>{t('rightPortability')}</li>
          <li>{t('rightOpposition')}</li>
        </ul>
        <p className="mt-3 text-[12px] text-foreground-subtle">
          {t.rich('contactDpo', {
            mail: (chunks) => (
              <a
                href={`mailto:${appConfig.dpoEmail}`}
                className="text-primary hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>

      {/* Section suppression */}
      <RgpdActions initialRequests={initialRequests} />
    </div>
  );
}
