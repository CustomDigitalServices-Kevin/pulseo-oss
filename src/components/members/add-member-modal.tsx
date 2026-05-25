'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Role } from '@/lib/auth/effective-role';
import { Loader2, UserPlus, Users as TeamIcon } from 'lucide-react';

const ROLE_RANK: Record<Role, number> = { viewer: 1, gestionnaire: 2, admin: 3 };

const emailSchema = z.string().email('Email invalide');
const roleSchema = z.enum(['admin', 'gestionnaire', 'viewer']);

const directFormSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});

const teamFormSchema = z.object({
  teamId: z.string().min(1, 'Sélectionnez une équipe'),
  email: emailSchema,
  role: roleSchema,
});

export interface TeamOption {
  id: string;
  name: string;
}

export interface AddMemberResult {
  ok: boolean;
  error?: string;
}

export interface AddMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actor: { role: Role | null; isSuperadmin: boolean };
  /** When provided and actor is superadmin, the team-flow tab is offered. */
  teams?: TeamOption[];
  onSubmitDirect: (args: { email: string; role: Role }) => Promise<AddMemberResult>;
  onSubmitTeam?: (args: {
    teamId: string;
    email: string;
    role: Role;
  }) => Promise<AddMemberResult>;
}

function allowedRoles(actor: { role: Role | null; isSuperadmin: boolean }): Role[] {
  if (actor.isSuperadmin) return ['admin', 'gestionnaire', 'viewer'];
  if (!actor.role) return [];
  const actorRank = ROLE_RANK[actor.role];
  return (['admin', 'gestionnaire', 'viewer'] as const).filter(
    (r) => ROLE_RANK[r] < actorRank,
  );
}

export function AddMemberModal({
  open,
  onOpenChange,
  actor,
  teams,
  onSubmitDirect,
  onSubmitTeam,
}: AddMemberModalProps) {
  const t = useTranslations('members');
  const ta = useTranslations('admin');
  const ROLE_LABELS: Record<Role, string> = {
    admin: ta('roleAdmin'),
    gestionnaire: ta('roleGestionnaire'),
    viewer: ta('roleViewer'),
  };

  const canTeamFlow =
    actor.isSuperadmin &&
    !!onSubmitTeam &&
    Array.isArray(teams) &&
    teams.length > 0;

  const [mode, setMode] = useState<'direct' | 'team'>('direct');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [teamId, setTeamId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const roleOptions = allowedRoles(actor);

  const reset = () => {
    setEmail('');
    setRole('');
    setTeamId('');
    setError(null);
    setFieldErrors({});
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    setError(null);
    setFieldErrors({});

    if (mode === 'direct') {
      const parsed = directFormSchema.safeParse({ email, role });
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0]?.toString() ?? '_';
          errs[key] = issue.message;
        }
        setFieldErrors(errs);
        return;
      }
      setLoading(true);
      const result = await onSubmitDirect(parsed.data);
      setLoading(false);
      if (result.ok) {
        reset();
        onOpenChange(false);
      } else {
        setError(result.error ?? t('modalErrorAdd'));
      }
      return;
    }

    if (!onSubmitTeam) return;
    const parsed = teamFormSchema.safeParse({ teamId, email, role });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? '_';
        errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setLoading(true);
    const result = await onSubmitTeam(parsed.data);
    setLoading(false);
    if (result.ok) {
      reset();
      onOpenChange(false);
    } else {
      setError(result.error ?? t('modalErrorAddTeam'));
    }
  };

  if (roleOptions.length === 0) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('modalCannotAddTitle')}</DialogTitle>
            <DialogDescription>
              {t('modalCannotAddDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('modalClose')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('modalTitle')}</DialogTitle>
          <DialogDescription>
            {mode === 'direct' ? t('modalDirectSubtitle') : t('modalTeamSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {canTeamFlow && (
          <div role="tablist" aria-label={t('modalModeAria')} className="inline-flex rounded-md border border-border bg-elevated p-0.5 mt-1">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'direct'}
              onClick={() => setMode('direct')}
              className={`px-3 py-1.5 text-[14px] rounded-[5px] gap-1.5 inline-flex items-center transition-colors ${
                mode === 'direct'
                  ? 'bg-primary/15 text-primary'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t('modalAddDirect')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'team'}
              onClick={() => setMode('team')}
              className={`px-3 py-1.5 text-[14px] rounded-[5px] gap-1.5 inline-flex items-center transition-colors ${
                mode === 'team'
                  ? 'bg-primary/15 text-primary'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              <TeamIcon className="w-3.5 h-3.5" />
              {t('viaTeam')}
            </button>
          </div>
        )}

        <div className="space-y-4 mt-2">
          {mode === 'team' && (
            <div className="space-y-1.5">
              <Label htmlFor="team-select">{t('modalTeamLabel')}</Label>
              <Select value={teamId} onValueChange={(v) => setTeamId(v ?? '')}>
                <SelectTrigger id="team-select" aria-invalid={!!fieldErrors.teamId}>
                  <SelectValue placeholder={t('modalSelectTeam')} />
                </SelectTrigger>
                <SelectContent>
                  {(teams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.teamId && (
                <p className="text-[13px] text-destructive">{fieldErrors.teamId}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="member-email">{t('modalEmailLabel')}</Label>
            <Input
              id="member-email"
              type="email"
              placeholder={t('modalEmailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email}
              autoComplete="off"
            />
            {fieldErrors.email && (
              <p className="text-[13px] text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-role">{t('modalRoleLabel')}</Label>
            <Select value={role} onValueChange={(v) => setRole((v ?? '') as Role | '')}>
              <SelectTrigger id="member-role" aria-invalid={!!fieldErrors.role}>
                <SelectValue placeholder={t('modalSelectRole')} />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.role && (
              <p className="text-[13px] text-destructive">{fieldErrors.role}</p>
            )}
            {!actor.isSuperadmin && (
              <p className="text-[13px] text-foreground-muted">
                {t('modalRoleHint')}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[14px] text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('modalCancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="gap-1.5">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === 'direct' ? t('modalAdd') : t('modalAddViaTeamBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
