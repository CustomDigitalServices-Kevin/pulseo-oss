'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { z } from 'zod';
import { Mail, Send, X, Trash2, UserPlus2, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { NonMemberRowDetail } from '@/actions/member-view';
import type { Role } from '@/lib/auth/effective-role';

export interface NonMemberActionResult {
  ok: boolean;
  error?: string;
}

export interface NonMemberDetailDrawerProps {
  detail: NonMemberRowDetail | null;
  onClose: () => void;
  onResendInvite?: (inviteId: string) => Promise<NonMemberActionResult>;
  onCancelInvite?: (inviteId: string) => Promise<NonMemberActionResult>;
  onUpdateResponsible?: (args: {
    responsibleId: string;
    email: string;
    name: string | null;
  }) => Promise<NonMemberActionResult>;
  onRemoveResponsible?: (responsibleId: string) => Promise<NonMemberActionResult>;
  onUpdateOrgLead?: (args: {
    organizationId: string;
    email: string | null;
    name: string | null;
  }) => Promise<NonMemberActionResult>;
  onConvertExternal?: (args: {
    organizationId: string;
    email: string;
    role: Role;
  }) => Promise<NonMemberActionResult>;
  organizationId: string;
}

const emailSchema = z.string().email();

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function NonMemberDetailDrawer({
  detail,
  onClose,
  onResendInvite,
  onCancelInvite,
  onUpdateResponsible,
  onRemoveResponsible,
  onUpdateOrgLead,
  onConvertExternal,
  organizationId,
}: NonMemberDetailDrawerProps) {
  const t = useTranslations('members');
  const tAdmin = useTranslations('admin');
  const locale = useLocale();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [convertRole, setConvertRole] = useState<Role>('viewer');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pattern "reset state on prop change" recommandé par React 19 — pas
  // d'useEffect car ça déclencherait un cascade-render. On compare détail
  // précédent et courant en flux normal de render.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [previousDetail, setPreviousDetail] = useState<NonMemberRowDetail | null>(detail);
  if (detail !== previousDetail) {
    setPreviousDetail(detail);
    if (detail) {
      setEmail(detail.email);
      setName(detail.kind !== 'invite' ? (detail.name ?? '') : '');
    } else {
      setEmail('');
      setName('');
    }
    setError(null);
    setLoading(null);
  }

  if (!detail) return null;

  const ROLE_LABELS: Record<Role, string> = {
    admin: tAdmin('roleAdmin'),
    gestionnaire: tAdmin('roleGestionnaire'),
    viewer: tAdmin('roleViewer'),
  };

  const handleResend = async () => {
    if (detail.kind !== 'invite' || !onResendInvite) return;
    setLoading('resend');
    setError(null);
    const r = await onResendInvite(detail.inviteId);
    setLoading(null);
    if (!r.ok) setError(r.error ?? t('externalErrorResend'));
  };

  const handleCancelInvite = async () => {
    if (detail.kind !== 'invite' || !onCancelInvite) return;
    setLoading('cancel');
    setError(null);
    const r = await onCancelInvite(detail.inviteId);
    setLoading(null);
    if (!r.ok) {
      setError(r.error ?? t('externalErrorCancel'));
      return;
    }
    onClose();
  };

  const handleSaveResponsible = async () => {
    if (detail.kind !== 'responsible' || !onUpdateResponsible) return;
    if (!emailSchema.safeParse(email).success) {
      setError(t('externalErrorEmailInvalid'));
      return;
    }
    setLoading('save');
    setError(null);
    const r = await onUpdateResponsible({
      responsibleId: detail.responsibleId,
      email,
      name: name.trim() || null,
    });
    setLoading(null);
    if (!r.ok) {
      setError(r.error ?? t('externalErrorSave'));
      return;
    }
    onClose();
  };

  const handleRemoveResponsible = async () => {
    if (detail.kind !== 'responsible' || !onRemoveResponsible) return;
    setLoading('remove');
    setError(null);
    const r = await onRemoveResponsible(detail.responsibleId);
    setLoading(null);
    if (!r.ok) {
      setError(r.error ?? t('externalErrorRemove'));
      return;
    }
    onClose();
  };

  const handleSaveOrgLead = async (clear = false) => {
    if (detail.kind !== 'org_lead' || !onUpdateOrgLead) return;
    if (!clear && !emailSchema.safeParse(email).success) {
      setError(t('externalErrorEmailInvalid'));
      return;
    }
    setLoading(clear ? 'remove' : 'save');
    setError(null);
    const r = await onUpdateOrgLead({
      organizationId: detail.organizationId,
      email: clear ? null : email,
      name: clear ? null : name.trim() || null,
    });
    setLoading(null);
    if (!r.ok) {
      setError(r.error ?? t('externalErrorSave'));
      return;
    }
    if (clear) onClose();
  };

  const handleConvert = async () => {
    if (!onConvertExternal) return;
    if (!emailSchema.safeParse(email).success) {
      setError(t('externalErrorEmailInvalid'));
      return;
    }
    setLoading('convert');
    setError(null);
    const r = await onConvertExternal({
      organizationId,
      email,
      role: convertRole,
    });
    setLoading(null);
    if (!r.ok) {
      setError(r.error ?? t('externalErrorConvert'));
      return;
    }
    onClose();
  };

  return (
    <Sheet open={!!detail} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-label={t('externalDrawerAria', { email: detail.email })}
        className="w-full !max-w-[560px] sm:!max-w-[560px] p-0 gap-0 overflow-y-auto bg-background border-l border-border h-dvh"
      >
        <SheetTitle className="sr-only">
          {t('externalDrawerAria', { email: detail.email })}
        </SheetTitle>

        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-4 flex items-start gap-4">
          <div
            aria-hidden="true"
            className="w-12 h-12 rounded-full flex items-center justify-center border shrink-0"
            style={{
              background:
                detail.kind === 'invite'
                  ? 'color-mix(in oklch, oklch(0.625 0.165 60) 22%, transparent)'
                  : 'color-mix(in oklch, oklch(0.625 0.165 240) 22%, transparent)',
              borderColor:
                detail.kind === 'invite'
                  ? 'color-mix(in oklch, oklch(0.625 0.165 60) 50%, transparent)'
                  : 'color-mix(in oklch, oklch(0.625 0.165 240) 50%, transparent)',
            }}
          >
            <Mail className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold truncate">{detail.email}</h2>
            <p className="text-[13px] text-foreground-muted">
              {detail.kind === 'invite'
                ? t('statusInvited')
                : detail.kind === 'responsible'
                  ? t('externalSourceResponsible')
                  : t('externalSourceOrgLead')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('drawerClose')}
            className="w-8 h-8 rounded-md border border-border hover:bg-elevated flex items-center justify-center text-foreground-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {detail.kind === 'invite' && (
            <>
              <section className="space-y-2 text-[14px]">
                <p className="text-foreground">
                  {t('externalInviteSummary', {
                    date: formatDate(detail.created_at, locale),
                    actor: detail.created_by_name ?? detail.created_by_email ?? '?',
                  })}
                </p>
                <p className="text-foreground-muted">{t('externalInviteHint')}</p>
              </section>
              <section className="flex flex-col gap-2">
                <Button
                  onClick={handleResend}
                  disabled={loading !== null}
                  className="w-full gap-2 justify-center"
                >
                  {loading === 'resend' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {t('externalResendInvite')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCancelInvite}
                  disabled={loading !== null}
                  className="w-full gap-2 justify-center"
                >
                  {loading === 'cancel' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {t('externalCancelInvite')}
                </Button>
              </section>
            </>
          )}

          {(detail.kind === 'responsible' || detail.kind === 'org_lead') && (
            <>
              <section className="space-y-3">
                <p className="text-[14px] text-foreground-muted">
                  {detail.kind === 'org_lead'
                    ? t('externalOrgLeadHint')
                    : t('externalResponsibleHint')}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-email">{t('externalEmail')}</Label>
                  <Input
                    id="ext-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-name">{t('externalName')}</Label>
                  <Input
                    id="ext-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <Button
                  onClick={
                    detail.kind === 'responsible'
                      ? handleSaveResponsible
                      : () => handleSaveOrgLead(false)
                  }
                  disabled={loading !== null}
                  className="w-full justify-center gap-2"
                >
                  {loading === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('externalSave')}
                </Button>
              </section>

              <section className="border-t border-border pt-5 space-y-3">
                <p className="text-[14px] font-semibold">
                  {t('externalConvertTitle')}
                </p>
                <p className="text-[13px] text-foreground-muted">
                  {t('externalConvertHint')}
                </p>
                <div className="flex items-center gap-2">
                  <Select value={convertRole} onValueChange={(v) => setConvertRole(v as Role)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">{ROLE_LABELS.viewer}</SelectItem>
                      <SelectItem value="gestionnaire">{ROLE_LABELS.gestionnaire}</SelectItem>
                      <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="secondary"
                    onClick={handleConvert}
                    disabled={loading !== null}
                    className="gap-2 flex-1 justify-center"
                  >
                    {loading === 'convert' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus2 className="w-4 h-4" />
                    )}
                    {t('externalConvertButton')}
                  </Button>
                </div>
              </section>

              <section className="border-t border-border pt-5">
                <Button
                  variant="destructive"
                  onClick={
                    detail.kind === 'responsible'
                      ? handleRemoveResponsible
                      : () => handleSaveOrgLead(true)
                  }
                  disabled={loading !== null}
                  className="w-full justify-center gap-2"
                >
                  {loading === 'remove' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {t('externalRemove')}
                </Button>
              </section>
            </>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[14px] text-destructive">
              {error}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
