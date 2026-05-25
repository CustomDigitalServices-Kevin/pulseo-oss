'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createMagicLink } from '@/actions/magic-links';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SpotlightCard } from '@/components/common/spotlight-card';
import {
  Send,
  Mail,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowRight,
} from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  slug: string;
  color_primary: string | null;
}

interface SentLink {
  email: string;
  orgName: string;
  orgSlug: string;
  sentAt: Date;
}

export function MagicLinkForm({ organizations }: { organizations: Organization[] }) {
  const t = useTranslations('admin');
  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sentLinks, setSentLinks] = useState<SentLink[]>([]);

  const selectedOrg = organizations.find((o) => o.id === orgId);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await createMagicLink({ email, organization_id: orgId });

    if (result.success && result.data) {
      const orgName = selectedOrg?.name ?? result.data.orgSlug;
      setSentLinks((prev) => [
        {
          email: result.data.email,
          orgName,
          orgSlug: result.data.orgSlug,
          sentAt: new Date(),
        },
        ...prev,
      ]);
      setSuccess(t('magicLinkFormSent', { email: result.data.email }));
      setEmail('');
    } else {
      setError(result.error ?? t('genericError'));
    }

    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Form — 3 columns */}
      <SpotlightCard
        tintVar="oklch(0.625 0.205 264)"
        className="lg:col-span-3 glow-border relative overflow-hidden rounded-xl bg-elevated border border-border"
      >
        {/* Tinted halo */}
        <div
          aria-hidden
          className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-30"
          style={{ background: 'radial-gradient(circle, oklch(0.625 0.205 264) 0%, transparent 65%)' }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, color-mix(in oklch, oklch(0.625 0.205 264) 35%, transparent), transparent)',
          }}
        />

        <div className="relative p-6 lg:p-7">
          {/* Header */}
          <div className="flex items-start gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: 'color-mix(in oklch, oklch(0.625 0.205 264) 14%, transparent)',
                borderColor: 'color-mix(in oklch, oklch(0.625 0.205 264) 28%, transparent)',
                boxShadow: '0 0 20px -4px color-mix(in oklch, oklch(0.625 0.205 264) 55%, transparent)',
              }}
            >
              <Send className="w-4 h-4 text-primary" strokeWidth={2.25} />
            </div>
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold tracking-tight">{t('magicLinkFormTitle')}</h2>
              <p className="text-[14px] text-foreground-muted mt-1">
                {t('magicLinkFormSubtitle')}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 p-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-md text-[15px] animate-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {success && (
              <div
                className="flex items-start gap-2.5 p-3 border rounded-md text-[15px] animate-in"
                style={{
                  background: 'color-mix(in oklch, oklch(0.700 0.165 155) 12%, transparent)',
                  borderColor: 'color-mix(in oklch, oklch(0.700 0.165 155) 30%, transparent)',
                  color: 'oklch(0.700 0.165 155)',
                }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{success}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="org" className="text-xs font-medium text-foreground-muted flex items-center gap-1.5">
                <Building2 className="w-3 h-3" />
                {t('magicLinkFormOrgLabel')}
              </Label>
              <Select value={orgId} onValueChange={(v) => setOrgId(v ?? '')}>
                <SelectTrigger className="w-full h-10 bg-elevated border-border focus-visible:border-primary/50">
                  {selectedOrg ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0 ring-1 ring-border"
                        style={{ backgroundColor: selectedOrg.color_primary || 'oklch(0.625 0.205 264)' }}
                      />
                      <span className="truncate">{selectedOrg.name}</span>
                      <span className="text-[13px] font-mono" style={{ color: 'var(--foreground-subtle)' }}>
                        {selectedOrg.slug}
                      </span>
                    </span>
                  ) : (
                    <SelectValue placeholder={t('magicLinkFormOrgPlaceholder')} />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0 ring-1 ring-border"
                          style={{ backgroundColor: org.color_primary || 'oklch(0.625 0.205 264)' }}
                        />
                        <span>{org.name}</span>
                        <span className="text-[13px] font-mono" style={{ color: 'var(--foreground-subtle)' }}>
                          {org.slug}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-foreground-muted flex items-center gap-1.5">
                <Mail className="w-3 h-3" />
                {t('magicLinkFormEmailLabel')}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('magicLinkFormEmailPlaceholder')}
                className="h-10 bg-elevated border-border focus-visible:border-primary/50"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !orgId || !email}
              className="w-full h-10 text-sm font-medium gap-2 group"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {t('magicLinkFormSending')}
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  {t('magicLinkFormSend')}
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </Button>
          </form>
        </div>
      </SpotlightCard>

      {/* Side panel — 2 columns: how it works */}
      <div className="lg:col-span-2 space-y-3">
        <SpotlightCard
          tintVar="oklch(0.700 0.165 155)"
          className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border"
        >
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-30"
            style={{ background: 'radial-gradient(circle, oklch(0.700 0.165 155) 0%, transparent 65%)' }}
          />
          <div className="relative p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[oklch(0.700_0.165_155)]" />
              <h3 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                {t('magicLinkHowItWorks')}
              </h3>
            </div>
            <ol className="space-y-2.5">
              {[
                t('magicLinkStep1'),
                t('magicLinkStep2'),
                t('magicLinkStep3'),
                t('magicLinkStep4'),
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-2.5 text-[14px] text-foreground-muted">
                  <span className="w-4 h-4 shrink-0 rounded-full bg-elevated border border-border-strong flex items-center justify-center text-[9px] font-semibold text-foreground tabular-nums mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </SpotlightCard>

        <SpotlightCard
          tintVar="oklch(0.700 0.165 230)"
          className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border"
        >
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-30"
            style={{ background: 'radial-gradient(circle, oklch(0.700 0.165 230) 0%, transparent 65%)' }}
          />
          <div className="relative p-5 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[oklch(0.700_0.165_230)] shrink-0 mt-0.5" />
              <div>
                <p className="text-[14px] font-medium">{t('magicLinkSecureTitle')}</p>
                <p className="text-[13px] text-foreground-subtle mt-0.5">
                  {t('magicLinkSecureDesc')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Zap className="w-4 h-4 text-[oklch(0.795_0.155_80)] shrink-0 mt-0.5" />
              <div>
                <p className="text-[14px] font-medium">{t('magicLinkNoPwdTitle')}</p>
                <p className="text-[13px] text-foreground-subtle mt-0.5">
                  {t('magicLinkNoPwdDesc')}
                </p>
              </div>
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* Historique des envois — full width below */}
      {sentLinks.length > 0 && (
        <div className="lg:col-span-5">
          <SpotlightCard className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border">
            <div className="relative p-5">
              <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-border">
                <div className="w-7 h-7 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="text-[15px] font-semibold">{t('magicLinkHistory')}</h3>
              </div>
              <div className="space-y-1.5 animate-in-stagger">
                {sentLinks.map((link, i) => (
                  <div
                    key={`${link.email}-${i}`}
                    className="list-item-premium flex items-center justify-between p-3 border border-border rounded-md"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 border"
                        style={{
                          background: 'color-mix(in oklch, oklch(0.700 0.165 155) 14%, transparent)',
                          borderColor: 'color-mix(in oklch, oklch(0.700 0.165 155) 28%, transparent)',
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.700_0.165_155)]" />
                      </div>
                      <div className="min-w-0 leading-tight">
                        <p className="text-[15px] font-medium truncate">{link.email}</p>
                        <p className="text-[13px] text-foreground-subtle mt-0.5">{link.orgName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Badge variant="secondary" className="font-normal text-[12px] h-5 px-1.5 bg-canvas border-border text-foreground-muted font-mono">
                        {link.orgSlug}
                      </Badge>
                      <span className="text-[13px] text-foreground-subtle hidden sm:inline tabular-nums">
                        {link.sentAt.toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>
        </div>
      )}
    </div>
  );
}
