'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Search, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/auth/effective-role';

export type RoleSource =
  | { kind: 'direct' }
  | { kind: 'superadmin' }
  | { kind: 'group'; name: string }
  | { kind: 'team'; name: string };

export type MemberStatus = 'active' | 'invited' | 'inactive' | 'external_contact';

/**
 * Origine d'une ligne dans la liste des membres.
 *  - `member`     : row dans organization_members ou source group/team (user Pulseo)
 *  - `invite`     : invite_link actif sans membership encore créé (user pas encore inscrit)
 *  - `responsible`: contact externe via organization_responsibles (multi)
 *  - `org_lead`   : contact externe via organizations.responsible_email/name legacy (single)
 */
export type MemberSourceKind = 'member' | 'invite' | 'responsible' | 'org_lead';

export interface MemberRow {
  /**
   * Identifiant unique de la ligne dans la table membres.
   *  - `member`      : userId (varchar 36)
   *  - `invite`      : `invite:<inviteLinkId>`
   *  - `responsible` : `responsible:<responsibleId>`
   *  - `org_lead`    : `org_lead:<orgId>`
   */
  id: string;
  source_kind: MemberSourceKind;
  email: string;
  name: string | null;
  date_added: string;
  effective_role: Role;
  role_source: RoleSource;
  status: MemberStatus;
  inactive_days: number | null;
  last_activity_at: string | null;
  tickets_created_30d: number;
  tickets_commented_30d: number;
  sparkline_30d: number[];
  heatmap_7d: number[];
  median_response_minutes: number | null;
  can_edit_role: boolean;
  can_remove: boolean;
}

export type MembersTableScope =
  | { type: 'global' }
  | { type: 'group'; id: string }
  | { type: 'org'; id: string };

export interface MembersTableProps {
  members: MemberRow[];
  scope: MembersTableScope;
  actor: { role: Role | null; isSuperadmin: boolean };
  onEditRole?: (memberId: string) => void;
  onRemove?: (memberId: string) => void;
  onOpenDetail?: (memberId: string) => void;
  onAddMember?: () => void;
}

type RoleFilter = 'all' | Role;
type ProvenanceFilter = 'all' | 'direct' | 'team' | 'group';

function roleSourceKey(source: RoleSource): ProvenanceFilter {
  if (source.kind === 'direct' || source.kind === 'superadmin') return 'direct';
  return source.kind;
}

function formatDateLocalized(iso: string, dateLocale: string): string {
  return new Date(iso).toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMinutes(
  minutes: number | null,
  labels: { minutesShort: string; hoursShort: string; daysShort: string; dash: string },
): string {
  if (minutes === null) return labels.dash;
  if (minutes < 60) return `${Math.round(minutes)} ${labels.minutesShort}`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} ${labels.hoursShort}`;
  return `${(hours / 24).toFixed(1)} ${labels.daysShort}`;
}

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase() || email[0]!.toUpperCase();
  }
  return email[0]!.toUpperCase();
}

function Sparkline({
  data,
  className,
  ariaLabel,
  dashEmpty,
}: {
  data: number[];
  className?: string;
  ariaLabel: string;
  dashEmpty: string;
}) {
  if (data.length === 0) {
    return <span className="text-foreground-subtle text-[13px]">{dashEmpty}</span>;
  }
  const max = Math.max(...data, 1);
  const width = 72;
  const height = 20;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('block', className)}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="text-primary/70"
      />
    </svg>
  );
}

function Heatmap7({
  data,
  ariaLabel,
  eventsTooltip,
}: {
  data: number[];
  ariaLabel: string;
  eventsTooltip: (count: number) => string;
}) {
  const max = Math.max(...data, 1);
  return (
    <div role="img" aria-label={ariaLabel} className="flex gap-[2px]">
      {data.map((value, idx) => {
        const intensity = value / max;
        return (
          <span
            key={idx}
            className="w-[8px] h-[14px] rounded-[2px] border border-border/50"
            style={{
              background: `color-mix(in oklch, oklch(0.625 0.205 264) ${(intensity * 100).toFixed(0)}%, transparent)`,
            }}
            title={eventsTooltip(value)}
          />
        );
      })}
    </div>
  );
}

function RoleSourcePill({
  source,
  labels,
}: {
  source: RoleSource;
  labels: { superadmin: string; viaGroup: (name: string) => string; viaTeam: (name: string) => string };
}) {
  if (source.kind === 'direct') {
    return null;
  }
  if (source.kind === 'superadmin') {
    return (
      <span
        className="ml-2 text-[12px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border"
        style={{
          background: 'color-mix(in oklch, oklch(0.625 0.205 280) 15%, transparent)',
          color: 'oklch(0.780 0.080 280)',
          borderColor: 'color-mix(in oklch, oklch(0.625 0.205 280) 30%, transparent)',
        }}
      >
        {labels.superadmin}
      </span>
    );
  }
  const color = source.kind === 'group' ? 250 : 30;
  const label = source.kind === 'group' ? labels.viaGroup(source.name) : labels.viaTeam(source.name);
  return (
    <span
      className="ml-2 text-[12px] font-medium px-1.5 py-0.5 rounded border"
      style={{
        background: `color-mix(in oklch, oklch(0.625 0.130 ${color}) 14%, transparent)`,
        color: `oklch(0.780 0.050 ${color})`,
        borderColor: `color-mix(in oklch, oklch(0.625 0.130 ${color}) 30%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({
  status,
  inactiveDays,
  labels,
}: {
  status: MemberStatus;
  inactiveDays: number | null;
  labels: {
    invited: string;
    inactive: string;
    active: string;
    external: string;
    inactiveWithDays: (d: number) => string;
  };
}) {
  if (status === 'invited') {
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[13px] bg-amber-500/15 text-amber-400 hover:bg-amber-500/20 border border-amber-500/25"
      >
        {labels.invited}
      </Badge>
    );
  }
  if (status === 'external_contact') {
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[13px] bg-sky-500/15 text-sky-400 hover:bg-sky-500/20 border border-sky-500/25"
      >
        {labels.external}
      </Badge>
    );
  }
  if (status === 'inactive') {
    return (
      <Badge variant="secondary" className="gap-1 text-[13px] text-foreground-muted">
        {inactiveDays ? labels.inactiveWithDays(inactiveDays) : labels.inactive}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 text-[13px] bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/25">
      {labels.active}
    </Badge>
  );
}

function inheritedTooltipBuilder(
  t: ReturnType<typeof useTranslations<'members'>>,
) {
  return (source: RoleSource): string | undefined => {
    if (source.kind === 'group') return t('tooltipInheritedGroup', { name: source.name });
    if (source.kind === 'team') return t('tooltipInheritedTeam', { name: source.name });
    if (source.kind === 'superadmin') return t('tooltipInheritedSuperadmin');
    return undefined;
  };
}

export function MembersTable({
  members,
  scope,
  actor,
  onEditRole,
  onRemove,
  onOpenDetail,
  onAddMember,
}: MembersTableProps) {
  void scope;
  void actor;
  const t = useTranslations('members');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';

  const ROLE_LABELS: Record<Role, string> = {
    admin: t('roleAdmin'),
    gestionnaire: t('roleGestionnaire'),
    viewer: t('roleViewer'),
  };

  const ROLE_SEGMENTS: Array<{ value: RoleFilter; label: string }> = [
    { value: 'all', label: t('filterAll') },
    { value: 'admin', label: t('filterAdmin') },
    { value: 'gestionnaire', label: t('filterManagers') },
    { value: 'viewer', label: t('filterViewers') },
  ];

  const PROVENANCE_SEGMENTS: Array<{ value: ProvenanceFilter; label: string }> = [
    { value: 'all', label: t('filterAll') },
    { value: 'direct', label: t('filterDirect') },
    { value: 'team', label: t('filterViaTeamFilter') },
    { value: 'group', label: t('filterViaGroup') },
  ];

  const formatMinutesLabels = {
    minutesShort: t('drawerMinutesShort'),
    hoursShort: t('drawerHoursShort'),
    daysShort: t('drawerDaysShort'),
    dash: t('drawerDash'),
  };

  const roleSourcePillLabels = {
    superadmin: t('drawerSuperadmin'),
    viaGroup: (name: string) => t('provenanceViaGroup', { name }),
    viaTeam: (name: string) => t('provenanceViaTeam', { name }),
  };

  const statusLabels = {
    invited: t('statusInvited'),
    inactive: t('statusInactive'),
    active: t('statusActive'),
    external: t('statusExternal'),
    inactiveWithDays: (days: number) => t('statusInactiveWithDays', { days }),
  };

  const inheritedTooltip = inheritedTooltipBuilder(t);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [provenanceFilter, setProvenanceFilter] = useState<ProvenanceFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.effective_role !== roleFilter) return false;
      if (provenanceFilter !== 'all' && roleSourceKey(m.role_source) !== provenanceFilter) return false;
      if (q) {
        const hay = `${m.email} ${m.name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, search, roleFilter, provenanceFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label={t('searchAria')}
          />
        </div>

        <div role="group" aria-label={t('filterRole')} className="inline-flex rounded-md border border-border bg-elevated p-0.5">
          {ROLE_SEGMENTS.map((seg) => (
            <button
              key={seg.value}
              type="button"
              onClick={() => setRoleFilter(seg.value)}
              aria-pressed={roleFilter === seg.value}
              className={cn(
                'px-2.5 py-1 text-[14px] rounded-[5px] transition-colors',
                roleFilter === seg.value
                  ? 'bg-primary/15 text-primary'
                  : 'text-foreground-muted hover:text-foreground',
              )}
            >
              {seg.label}
            </button>
          ))}
        </div>

        <div role="group" aria-label={t('filterProvenance')} className="inline-flex rounded-md border border-border bg-elevated p-0.5">
          {PROVENANCE_SEGMENTS.map((seg) => (
            <button
              key={seg.value}
              type="button"
              onClick={() => setProvenanceFilter(seg.value)}
              aria-pressed={provenanceFilter === seg.value}
              className={cn(
                'px-2.5 py-1 text-[14px] rounded-[5px] transition-colors',
                provenanceFilter === seg.value
                  ? 'bg-primary/15 text-primary'
                  : 'text-foreground-muted hover:text-foreground',
              )}
            >
              {seg.label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          {onAddMember && (
            <Button size="sm" onClick={onAddMember} className="gap-1.5">
              <UserPlus className="w-4 h-4" />
              {t('addMember')}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">{t('tableHeaderMember')}</TableHead>
              <TableHead>{t('tableHeaderRole')}</TableHead>
              <TableHead>{t('tableHeaderStatus')}</TableHead>
              <TableHead className="text-right">{t('tableHeaderTickets')}</TableHead>
              <TableHead>{t('tableHeaderActivity')}</TableHead>
              <TableHead>{t('tableHeader7d')}</TableHead>
              <TableHead className="text-right">{t('tableHeaderResponseTime')}</TableHead>
              <TableHead className="text-right">{t('tableHeaderActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-foreground-muted text-[15px]"
                >
                  {t('tableEmpty')}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const inherited = m.role_source.kind !== 'direct';
                const editTooltip = m.can_edit_role ? undefined : inheritedTooltip(m.role_source);
                const removeTooltip = m.can_remove ? undefined : inheritedTooltip(m.role_source);
                return (
                  <TableRow
                    key={m.id}
                    onClick={() => onOpenDetail?.(m.id)}
                    className={cn(onOpenDetail && 'cursor-pointer')}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          aria-hidden="true"
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold border"
                          style={{
                            background:
                              'linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.205 264) 100%, white 12%), oklch(0.625 0.205 264))',
                            borderColor: 'color-mix(in oklch, oklch(0.625 0.205 264) 50%, transparent)',
                            color: 'white',
                          }}
                        >
                          {initials(m.name, m.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[15px] font-medium truncate">
                            {m.name ?? m.email}
                          </div>
                          <div className="text-[13px] text-foreground-muted truncate">
                            {m.name ? m.email : formatDateLocalized(m.date_added, dateLocale)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center flex-wrap">
                        <span className="text-[14px] font-medium">
                          {ROLE_LABELS[m.effective_role]}
                        </span>
                        <RoleSourcePill source={m.role_source} labels={roleSourcePillLabels} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} inactiveDays={m.inactive_days} labels={statusLabels} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[14px]">
                      <span className="font-medium">{m.tickets_created_30d}</span>
                      <span className="text-foreground-subtle"> · </span>
                      <span className="text-foreground-muted">{m.tickets_commented_30d}</span>
                    </TableCell>
                    <TableCell>
                      <Sparkline
                        data={m.sparkline_30d}
                        ariaLabel={t('sparklineAriaLabel')}
                        dashEmpty={t('sparklineDashEmpty')}
                      />
                    </TableCell>
                    <TableCell>
                      <Heatmap7
                        data={m.heatmap_7d}
                        ariaLabel={t('heatmap7Aria')}
                        eventsTooltip={(count) => t('sparklineEventsTooltip', { count })}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[14px] text-foreground-muted">
                      {formatMinutes(m.median_response_minutes, formatMinutesLabels)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => onEditRole?.(m.id)}
                          disabled={!m.can_edit_role}
                          title={editTooltip}
                          aria-label={t('editRoleFor', { name: m.name ?? m.email })}
                          className={cn(
                            'inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors',
                            m.can_edit_role
                              ? 'border-border hover:bg-primary/10 hover:border-primary/30 text-foreground-muted hover:text-primary'
                              : 'border-border/40 text-foreground-subtle cursor-not-allowed opacity-60',
                          )}
                          data-inherited={inherited ? 'true' : 'false'}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove?.(m.id)}
                          disabled={!m.can_remove}
                          title={removeTooltip}
                          aria-label={t('removeAria', { name: m.name ?? m.email })}
                          className={cn(
                            'inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors',
                            m.can_remove
                              ? 'border-border hover:bg-destructive/10 hover:border-destructive/30 text-foreground-muted hover:text-destructive'
                              : 'border-border/40 text-foreground-subtle cursor-not-allowed opacity-60',
                          )}
                          data-inherited={inherited ? 'true' : 'false'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-[13px] text-foreground-subtle text-right">
        {t('tableCountSuffix', { filtered: filtered.length, total: members.length, count: members.length })}
      </div>
    </div>
  );
}
