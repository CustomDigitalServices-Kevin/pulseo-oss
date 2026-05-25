'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createInviteLink, revokeInviteLink } from '@/actions/invite-links';
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
  UserPlus,
  Building2,
  Copy,
  Check,
  XCircle,
  AlertCircle,
  CheckCircle2,
  Link2,
  Users,
  Clock,
  Tag,
  ArrowRight,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  slug: string;
  color_primary: string | null;
}

interface InviteLinkData {
  id: string;
  token: string;
  label: string | null;
  is_active: boolean;
  use_count: number;
  expires_at: string | null;
  created_at: string;
  organization: { name: string; slug: string; color_primary: string | null };
}

export function InviteLinkManager({
  organizations,
  initialLinks,
}: {
  organizations: Organization[];
  initialLinks: InviteLinkData[];
}) {
  const t = useTranslations('admin');
  const [orgId, setOrgId] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [links, setLinks] = useState(initialLinks);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const selectedOrg = organizations.find((o) => o.id === orgId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setGeneratedUrl(null);

    const result = await createInviteLink({
      organization_id: orgId,
      label: label || undefined,
    });

    if (result.success && result.data) {
      setGeneratedUrl(result.data.url);
      setSuccess(t('inviteLinkFormCreated', { org: result.data.orgName }));
      setLabel('');

      if (selectedOrg) {
        setLinks((prev) => [
          {
            id: result.data.id,
            token: result.data.token,
            label: label || null,
            is_active: true,
            use_count: 0,
            expires_at: null,
            created_at: new Date().toISOString(),
            organization: {
              name: selectedOrg.name,
              slug: selectedOrg.slug,
              color_primary: selectedOrg.color_primary,
            },
          },
          ...prev,
        ]);
      }
    } else {
      setError(result.error ?? t('genericError'));
    }

    setLoading(false);
  };

  const handleRevoke = async (linkId: string) => {
    setRevokingId(linkId);
    await revokeInviteLink(linkId);
    setLinks((prev) =>
      prev.map((l) => (l.id === linkId ? { ...l, is_active: false } : l))
    );
    setRevokingId(null);
  };

  const handleCopy = async (url: string, key: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const activeLinks = links.filter((l) => l.is_active);
  const inactiveLinks = links.filter((l) => !l.is_active);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Form — 3 columns */}
      <SpotlightCard
        tintVar="oklch(0.625 0.205 264)"
        className="lg:col-span-3 glow-border relative overflow-hidden rounded-xl bg-elevated border border-border"
      >
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
              <UserPlus className="w-4 h-4 text-primary" strokeWidth={2.25} />
            </div>
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold tracking-tight">{t('inviteLinkFormTitle')}</h2>
              <p className="text-[14px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
                {t('inviteLinkFormSubtitle')}
              </p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 p-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-md text-[15px] animate-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Organization */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--foreground-muted)' }}>
                <Building2 className="w-3 h-3" />
                {t('inviteLinkFormOrgLabel')}
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
                    <SelectValue placeholder={t('inviteLinkFormOrgPlaceholder')} />
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

            {/* Label */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--foreground-muted)' }}>
                <Tag className="w-3 h-3" />
                {t('inviteLinkFormLabelOptional')}
              </Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('inviteLinkFormLabelPlaceholder')}
                className="h-10 bg-elevated border-border focus-visible:border-primary/50"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !orgId}
              className="w-full h-10 text-sm font-medium gap-2 group"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {t('inviteLinkFormCreating')}
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5" />
                  {t('inviteLinkFormGenerate')}
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </Button>
          </form>

          {/* Generated URL — premium reveal */}
          {generatedUrl && success && (
            <div
              className="mt-5 p-4 rounded-lg space-y-3 animate-in"
              style={{
                background: 'color-mix(in oklch, oklch(0.700 0.165 155) 10%, transparent)',
                border: '1px solid color-mix(in oklch, oklch(0.700 0.165 155) 30%, transparent)',
              }}
            >
              <div
                className="flex items-center gap-2 text-[15px] font-medium"
                style={{ color: 'oklch(0.700 0.165 155)' }}
              >
                <CheckCircle2 className="w-4 h-4" />
                {success}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[13px] font-mono bg-canvas p-2.5 rounded-md border border-border truncate text-foreground">
                  {generatedUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(generatedUrl, 'generated')}
                  className="gap-1.5 shrink-0 h-9"
                >
                  {copied === 'generated' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      {t('inviteLinkCopied')}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {t('inviteLinkCopy')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SpotlightCard>

      {/* Side panel */}
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
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'oklch(0.700 0.165 155)' }} />
              <h3 className="text-[14px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--foreground-muted)' }}>
                {t('inviteLinkHowItWorks')}
              </h3>
            </div>
            <ol className="space-y-2.5">
              {[
                t('inviteLinkStep1'),
                t('inviteLinkStep2'),
                t('inviteLinkStep3'),
                t('inviteLinkStep4'),
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-2.5 text-[14px]" style={{ color: 'var(--foreground-muted)' }}>
                  <span
                    className="w-4 h-4 shrink-0 rounded-full bg-canvas border border-border-strong flex items-center justify-center text-[9px] font-semibold tabular-nums mt-0.5 text-foreground"
                  >
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
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'oklch(0.700 0.165 230)' }} />
              <div>
                <p className="text-[14px] font-medium">{t('inviteLinkEmailVerifTitle')}</p>
                <p className="text-[13px] mt-0.5" style={{ color: 'var(--foreground-subtle)' }}>
                  {t('inviteLinkEmailVerifDesc')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Users className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'oklch(0.795 0.155 80)' }} />
              <div>
                <p className="text-[14px] font-medium">{t('inviteLinkNoLimitTitle')}</p>
                <p className="text-[13px] mt-0.5" style={{ color: 'var(--foreground-subtle)' }}>
                  {t('inviteLinkNoLimitDesc')}
                </p>
              </div>
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* Active links — full width */}
      {activeLinks.length > 0 && (
        <div className="lg:col-span-5">
          <SpotlightCard className="relative overflow-hidden rounded-xl bg-elevated border border-border">
            <div className="relative">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center border"
                  style={{
                    backgroundColor: 'color-mix(in oklch, oklch(0.700 0.165 155) 14%, transparent)',
                    borderColor: 'color-mix(in oklch, oklch(0.700 0.165 155) 28%, transparent)',
                  }}
                >
                  <Link2 className="w-3.5 h-3.5" style={{ color: 'oklch(0.700 0.165 155)' }} />
                </div>
                <h3 className="text-[15px] font-semibold">{t('inviteLinkActiveLinks')}</h3>
                <Badge
                  variant="secondary"
                  className="font-normal text-[12px] h-5 px-1.5 bg-canvas border-border"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  {activeLinks.length}
                </Badge>
              </div>

              <div className="p-3 space-y-1.5 animate-in-stagger">
                {activeLinks.map((link) => {
                  const tintColor = link.organization.color_primary || 'oklch(0.625 0.205 264)';
                  return (
                    <div
                      key={link.id}
                      className="list-item-premium flex items-center justify-between p-3 border border-border rounded-md group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-md flex items-center justify-center text-[14px] font-semibold shrink-0 border"
                          style={{
                            background: `linear-gradient(180deg, color-mix(in oklch, ${tintColor} 100%, white 12%), ${tintColor})`,
                            borderColor: `color-mix(in oklch, ${tintColor} 50%, transparent)`,
                            boxShadow: `0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px color-mix(in oklch, ${tintColor} 50%, transparent)`,
                            color: 'white',
                          }}
                        >
                          {link.organization.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 leading-tight">
                          <p className="text-[15px] font-medium truncate">
                            {link.label || link.organization.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap text-[13px]" style={{ color: 'var(--foreground-subtle)' }}>
                            <span className="font-mono">{link.organization.slug}</span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {t('inviteLinkUsageCount', { count: link.use_count })}
                            </span>
                            <span>·</span>
                            <span className="flex items-center gap-1 tabular-nums">
                              <Clock className="w-3 h-3" />
                              {new Date(link.created_at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(`${baseUrl}/invite/join/${link.token}`, link.id)}
                          className="h-8 px-2 text-[13px] gap-1.5"
                          title={t('inviteLinkCopyTitle')}
                        >
                          {copied === link.id ? (
                            <>
                              <Check className="w-3 h-3" />
                              {t('inviteLinkCopied')}
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              {t('inviteLinkCopy')}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(link.id)}
                          disabled={revokingId === link.id}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title={t('inviteLinkRevokeTitle')}
                        >
                          {revokingId === link.id ? (
                            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Inactive links */}
      {inactiveLinks.length > 0 && (
        <div className="lg:col-span-5">
          <SpotlightCard className="relative overflow-hidden rounded-xl bg-elevated border border-border opacity-70">
            <div className="relative">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
                <div className="w-7 h-7 rounded-md bg-canvas border border-border flex items-center justify-center">
                  <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--foreground-subtle)' }} />
                </div>
                <h3 className="text-[15px] font-semibold" style={{ color: 'var(--foreground-muted)' }}>
                  {t('inviteLinkRevoked')}
                </h3>
                <Badge
                  variant="secondary"
                  className="font-normal text-[12px] h-5 px-1.5 bg-canvas border-border"
                  style={{ color: 'var(--foreground-subtle)' }}
                >
                  {inactiveLinks.length}
                </Badge>
              </div>
              <div className="p-3 space-y-1.5">
                {inactiveLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-3 border border-border rounded-md"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-md bg-canvas border border-border flex items-center justify-center text-[14px] font-semibold shrink-0" style={{ color: 'var(--foreground-subtle)' }}>
                        {link.organization.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 leading-tight">
                        <p className="text-[15px] font-medium truncate" style={{ color: 'var(--foreground-muted)' }}>
                          {link.label || link.organization.name}
                        </p>
                        <p className="text-[13px] mt-0.5" style={{ color: 'var(--foreground-subtle)' }}>
                          {t('inviteLinkUsageCount', { count: link.use_count })} · {t('inviteLinkRevokedSuffix')}
                        </p>
                      </div>
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
