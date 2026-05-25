import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Sparkles, Shield, Zap, FileSearch } from 'lucide-react';
import { LegalFooter } from '@/components/legal/legal-footer';
import { Logo } from '@/components/common/logo';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('auth');
  return (
    <div className="min-h-screen flex bg-canvas">
      {/* ─── Left panel — brand ──────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[58%] relative overflow-hidden border-r border-border mesh-gradient">
        {/* Aurora — slowly drifting colour washes */}
        <div className="absolute inset-0 aurora" />

        {/* Decorative grid overlay */}
        <div className="absolute inset-0 bg-grid opacity-40" />

        {/* Floating decorative orbs */}
        <div
          className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl animate-float"
          style={{ background: 'radial-gradient(circle, oklch(0.625 0.205 264 / 0.7) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-32 -right-40 w-[480px] h-[480px] rounded-full opacity-35 blur-3xl"
          style={{
            background: 'radial-gradient(circle, oklch(0.680 0.180 310 / 0.65) 0%, transparent 70%)',
            animation: 'float 8s ease-in-out infinite reverse',
          }}
        />
        <div
          className="absolute top-1/3 left-1/2 w-[360px] h-[360px] rounded-full opacity-25 blur-3xl"
          style={{
            background: 'radial-gradient(circle, oklch(0.700 0.165 230 / 0.6) 0%, transparent 70%)',
            animation: 'float 10s ease-in-out infinite',
            animationDelay: '2s',
          }}
        />

        {/* Subtle vignette */}
        <div className="absolute inset-0 bg-gradient-to-tr from-canvas/60 via-transparent to-transparent" />

        {/* Film grain overlay */}
        <div className="absolute inset-0 bg-noise" />

        {/* Content */}
        <div className="relative z-10 flex flex-col p-14 w-full min-h-full">
          {/* Hero (centered vertically) */}
          <div className="flex-1 flex items-center">
            <div className="max-w-xl space-y-8">
              {/* Lockup logo (mark + wordmark) */}
              <Logo variant="horizontal" size={340} className="block" />

              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elevated/60 backdrop-blur border border-border text-foreground-muted text-xs">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span>{t('heroBadge')}</span>
                </div>
                <h1 className="text-[48px] leading-[1.02] font-semibold text-foreground tracking-[-0.025em]">
                  {t('heroTitleLine1')}
                  <br />
                  <span className="text-iridescent">{t('heroTitleLine2')}</span>
                </h1>
                <p className="text-foreground-muted text-[15px] leading-relaxed max-w-md">
                  {t('heroSubtitle')}
                </p>
              </div>

              {/* Feature pills with icons */}
              <div className="grid grid-cols-2 gap-2.5 max-w-md">
                {[
                  { icon: Zap, label: t('featureRealtimeTickets') },
                  { icon: FileSearch, label: t('featureContractsTracking') },
                  { icon: Shield, label: t('featureSecureDocuments') },
                  { icon: Sparkles, label: t('featureFullAudit') },
                ].map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <div
                      key={feat.label}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-elevated/40 backdrop-blur border border-border hover:border-border-strong hover:bg-elevated/60 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-md bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-[15px] text-foreground-muted font-medium">{feat.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <p className="text-foreground-subtle text-[13px] tracking-wide">
              {t('brandTagline')}
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>
      </div>

      {/* ─── Right panel — form ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-canvas relative">
        {/* Subtle radial accent behind the form */}
        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{ background: 'radial-gradient(at 50% 30%, oklch(0.625 0.205 264 / 0.10) 0px, transparent 50%)' }} />
        <div className="relative w-full max-w-[420px]">
          {children}
          <LegalFooter variant="auth" />
        </div>
      </div>
    </div>
  );
}
