'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { X, Ticket, MessageSquare, Clock, Activity, Pencil, Loader2 } from 'lucide-react';
import type { Role, RoleSourceEntry } from '@/lib/auth/effective-role';
import type { KpiSeries, HeatmapCell } from '@/lib/stats/aggregations';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export type PrimaryRoleSource =
  | { kind: 'direct' }
  | { kind: 'superadmin' }
  | { kind: 'group'; name: string }
  | { kind: 'team'; name: string };

export interface TimelineEvent {
  id: string;
  event_type: string;
  resource_id: string | null;
  created_at: string;
}

export interface MemberDetail {
  user: {
    id: string;
    name: string | null;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    job_title?: string | null;
  };
  effectiveRole: Role | null;
  primarySource: PrimaryRoleSource;
  roleSources: RoleSourceEntry[];
  kpis: {
    ticketsCreated30d: number;
    commentsPosted30d: number;
    medianResponseMinutes: number | null;
  };
  sparkline: KpiSeries[];
  heatmap: HeatmapCell[];
  timeline: TimelineEvent[];
}

export interface UpdateMemberInfoArgs {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
}

export interface MemberDetailDrawerProps {
  detail: MemberDetail | null;
  onClose: () => void;
  /**
   * Active members only. When provided, exposes an "Edit" action that opens
   * an inline form to update name / first_name / last_name / job_title.
   * Returns ok=false to surface an error inline without closing the drawer.
   */
  onUpdateInfo?: (args: UpdateMemberInfoArgs) => Promise<{ ok: boolean; error?: string }>;
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

function formatDateTimeLocalized(iso: string, dateLocale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(dateLocale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateLocalized(iso: string, dateLocale: string): string {
  return new Date(iso).toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function AreaSparkline({
  data,
  dateLocale,
  emptyLabel,
  ariaLabel,
}: {
  data: KpiSeries[];
  dateLocale: string;
  emptyLabel: string;
  ariaLabel: string;
}) {
  if (data.length === 0) {
    return (
      <div className="h-[120px] flex items-center justify-center text-[14px] text-foreground-muted">
        {emptyLabel}
      </div>
    );
  }
  const width = 480;
  const height = 120;
  const pad = { top: 8, right: 8, bottom: 20, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => d.count), 1);
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: pad.left + i * step,
    y: pad.top + innerH - (d.count / max) * innerH,
  }));
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const areaPath = `${linePath} L${last.x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${first.x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;

  const gridY = [0, 0.5, 1].map((t) => pad.top + t * innerH);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[120px]"
    >
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.625 0.205 264)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="oklch(0.625 0.205 264)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridY.map((y, i) => (
        <line
          key={i}
          x1={pad.left}
          x2={pad.left + innerW}
          y1={y}
          y2={y}
          stroke="oklch(1 0 0 / 0.06)"
          strokeWidth={1}
        />
      ))}
      <path d={areaPath} fill="url(#area-grad)" />
      <path d={linePath} fill="none" stroke="oklch(0.625 0.205 264)" strokeWidth={1.5} />
      <text
        x={pad.left}
        y={height - 4}
        fontSize={10}
        fill="oklch(0.7 0 0 / 0.7)"
      >
        {formatDateLocalized(data[0]!.date, dateLocale)}
      </text>
      <text
        x={pad.left + innerW}
        y={height - 4}
        fontSize={10}
        textAnchor="end"
        fill="oklch(0.7 0 0 / 0.7)"
      >
        {formatDateLocalized(data[data.length - 1]!.date, dateLocale)}
      </text>
    </svg>
  );
}

function Heatmap7x24({
  data,
  dayLabels,
  lessLabel,
  moreLabel,
  tooltipBuilder,
}: {
  data: HeatmapCell[];
  dayLabels: string[];
  lessLabel: string;
  moreLabel: string;
  tooltipBuilder: (day: string, hour: number, count: number) => string;
}) {
  const max = Math.max(...data.map((c) => c.count), 1);
  const lookup = new Map<string, number>();
  for (const c of data) lookup.set(`${c.day_of_week}:${c.hour}`, c.count);

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div className="w-8" />
        <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px] flex-1">
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              className="text-[9px] text-center text-foreground-subtle tabular-nums"
            >
              {h % 3 === 0 ? h : ''}
            </span>
          ))}
        </div>
      </div>
      {Array.from({ length: 7 }, (_, day) => (
        <div key={day} className="flex gap-2 items-center">
          <div className="w-8 text-[12px] text-foreground-muted">{dayLabels[day]}</div>
          <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px] flex-1">
            {Array.from({ length: 24 }, (_, hour) => {
              const count = lookup.get(`${day}:${hour}`) ?? 0;
              const intensity = count / max;
              return (
                <span
                  key={hour}
                  className="aspect-square rounded-[2px] border border-border/30"
                  style={{
                    background: intensity
                      ? `color-mix(in oklch, oklch(0.625 0.205 264) ${(intensity * 100).toFixed(0)}%, transparent)`
                      : 'oklch(1 0 0 / 0.02)',
                  }}
                  title={tooltipBuilder(dayLabels[day]!, hour, count)}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-end gap-2 pt-2 text-[12px] text-foreground-subtle">
        <span>{lessLabel}</span>
        {[0.15, 0.4, 0.65, 0.9].map((t) => (
          <span
            key={t}
            className="w-3 h-3 rounded-[2px] border border-border/40"
            style={{
              background: `color-mix(in oklch, oklch(0.625 0.205 264) ${(t * 100).toFixed(0)}%, transparent)`,
            }}
          />
        ))}
        <span>{moreLabel}</span>
      </div>
    </div>
  );
}

function RoleSourceItem({
  entry,
  dateLocale,
  roleLabels,
  t,
}: {
  entry: RoleSourceEntry;
  dateLocale: string;
  roleLabels: Record<Role, string>;
  t: ReturnType<typeof useTranslations<'members'>>;
}) {
  const dateLabel = formatDateLocalized(entry.since, dateLocale);
  if (entry.kind === 'direct') {
    return (
      <li className="text-[14px] leading-relaxed">
        <span className="text-foreground font-medium">{t('drawerRoleDirectMembership')}</span>{' '}
        <span
          className="text-foreground-muted"
          dangerouslySetInnerHTML={{
            __html: t('drawerRoleSince', { role: roleLabels[entry.role], date: dateLabel }),
          }}
        />
      </li>
    );
  }
  if (entry.kind === 'group_manager') {
    return (
      <li className="text-[14px] leading-relaxed">
        <span className="text-foreground font-medium">
          {t('drawerRoleGroupManager', { name: entry.groupName })}
        </span>{' '}
        <span className="text-foreground-muted">{t('drawerRoleSinceDate', { date: dateLabel })}</span>
      </li>
    );
  }
  return (
    <li className="text-[14px] leading-relaxed">
      <span className="text-foreground font-medium">
        {t('drawerRoleGrantTeam', { name: entry.teamName })}
      </span>{' '}
      <span
        className="text-foreground-muted"
        dangerouslySetInnerHTML={{
          __html: t('drawerRoleGrantedSince', { role: roleLabels[entry.role], date: dateLabel }),
        }}
      />
    </li>
  );
}

function PrimaryPill({
  source,
  labels,
}: {
  source: PrimaryRoleSource;
  labels: {
    direct: string;
    superadmin: string;
    viaGroup: (name: string) => string;
    viaTeam: (name: string) => string;
  };
}) {
  if (source.kind === 'direct') {
    return (
      <span className="text-[12px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-foreground-muted">
        {labels.direct}
      </span>
    );
  }
  if (source.kind === 'superadmin') {
    return (
      <span
        className="text-[12px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border"
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
      className="text-[12px] font-medium px-1.5 py-0.5 rounded border"
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

export function MemberDetailDrawer({ detail, onClose, onUpdateInfo }: MemberDetailDrawerProps) {
  const t = useTranslations('members');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';

  const [editing, setEditing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  if (!detail) return null;

  const { user, effectiveRole, primarySource, roleSources, kpis, sparkline, heatmap, timeline } = detail;

  const openEdit = () => {
    setFormName(user.name ?? '');
    setFormFirstName(user.first_name ?? '');
    setFormLastName(user.last_name ?? '');
    setFormJobTitle(user.job_title ?? '');
    setEditError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };

  const submitEdit = async () => {
    if (!onUpdateInfo) return;
    setSavingEdit(true);
    setEditError(null);
    const r = await onUpdateInfo({
      name: formName.trim() || null,
      first_name: formFirstName.trim() || null,
      last_name: formLastName.trim() || null,
      job_title: formJobTitle.trim() || null,
    });
    setSavingEdit(false);
    if (!r.ok) {
      setEditError(r.error ?? t('editInfoErrorSave'));
      return;
    }
    setEditing(false);
  };

  const ROLE_LABELS: Record<Role, string> = {
    admin: t('roleAdmin'),
    gestionnaire: t('roleGestionnaire'),
    viewer: t('roleViewer'),
  };

  const DAY_LABELS: string[] = [
    t('daySunShort'),
    t('dayMonShort'),
    t('dayTueShort'),
    t('dayWedShort'),
    t('dayThuShort'),
    t('dayFriShort'),
    t('daySatShort'),
  ];

  const EVENT_LABEL: Record<string, string> = {
    login: t('eventLogin'),
    ticket_created: t('eventTicketCreated'),
    ticket_commented: t('eventTicketCommented'),
    ticket_viewed: t('eventTicketViewed'),
  };

  const eventLabel = (type: string): string => EVENT_LABEL[type] ?? type;

  const formatMinutesLabels = {
    minutesShort: t('drawerMinutesShort'),
    hoursShort: t('drawerHoursShort'),
    daysShort: t('drawerDaysShort'),
    dash: t('drawerDash'),
  };

  const primaryPillLabels = {
    direct: t('drawerDirect'),
    superadmin: t('drawerSuperadmin'),
    viaGroup: (name: string) => t('provenanceViaGroup', { name }),
    viaTeam: (name: string) => t('provenanceViaTeam', { name }),
  };

  return (
    <Sheet open={!!detail} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-label={t('drawerDetailsAria', { name: user.name ?? user.email })}
        className="w-full !max-w-[720px] sm:!max-w-[720px] p-0 gap-0 overflow-y-auto bg-background border-l border-border h-dvh"
      >
        <SheetTitle className="sr-only">
          {t('drawerDetailsAria', { name: user.name ?? user.email })}
        </SheetTitle>
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-4 flex items-start gap-4">
          <div
            aria-hidden="true"
            className="w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-semibold border shrink-0"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.205 264) 100%, white 12%), oklch(0.625 0.205 264))',
              borderColor: 'color-mix(in oklch, oklch(0.625 0.205 264) 50%, transparent)',
              color: 'white',
            }}
          >
            {initials(user.name, user.email)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold truncate">{user.name ?? user.email}</h2>
            <p className="text-[14px] text-foreground-muted truncate">{user.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[14px] font-medium">
                {effectiveRole ? ROLE_LABELS[effectiveRole] : t('drawerNoAccess')}
              </span>
              <PrimaryPill source={primarySource} labels={primaryPillLabels} />
            </div>
          </div>
          {onUpdateInfo && !editing && (
            <button
              type="button"
              onClick={openEdit}
              aria-label={t('editInfoOpen')}
              className="w-8 h-8 rounded-md border border-border hover:bg-primary/10 hover:border-primary/30 hover:text-primary flex items-center justify-center text-foreground-muted"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
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
          {editing && (
            <section
              aria-label={t('editInfoTitle')}
              className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4 space-y-3"
            >
              <h3 className="text-[15px] font-semibold">{t('editInfoTitle')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-first-name">{t('editInfoFieldFirstName')}</Label>
                  <Input
                    id="edit-first-name"
                    value={formFirstName}
                    onChange={(e) => setFormFirstName(e.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-last-name">{t('editInfoFieldLastName')}</Label>
                  <Input
                    id="edit-last-name"
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    maxLength={120}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-name">{t('editInfoFieldName')}</Label>
                <Input
                  id="edit-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={255}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-job">{t('editInfoFieldJobTitle')}</Label>
                <Input
                  id="edit-job"
                  value={formJobTitle}
                  onChange={(e) => setFormJobTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
              {editError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {editError}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={cancelEdit} disabled={savingEdit}>
                  {t('editInfoCancel')}
                </Button>
                <Button onClick={submitEdit} disabled={savingEdit} className="gap-2">
                  {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('editInfoSave')}
                </Button>
              </div>
            </section>
          )}
          <section aria-label={t('drawerKpisAria')}>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-elevated p-3">
                <div className="flex items-center gap-1.5 text-[13px] text-foreground-muted">
                  <Ticket className="w-3 h-3" />
                  {t('drawerTicketsCreated30d')}
                </div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">
                  {kpis.ticketsCreated30d}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-elevated p-3">
                <div className="flex items-center gap-1.5 text-[13px] text-foreground-muted">
                  <MessageSquare className="w-3 h-3" />
                  {t('drawerComments30d')}
                </div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">
                  {kpis.commentsPosted30d}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-elevated p-3">
                <div className="flex items-center gap-1.5 text-[13px] text-foreground-muted">
                  <Clock className="w-3 h-3" />
                  {t('drawerAvgResponse')}
                </div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">
                  {formatMinutes(kpis.medianResponseMinutes, formatMinutesLabels)}
                </div>
              </div>
            </div>
          </section>

          <section aria-label={t('drawerActivity30d')}>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[15px] font-semibold text-foreground">{t('drawerActivity30d')}</h3>
            </div>
            <div className="rounded-lg border border-border bg-elevated p-3">
              <AreaSparkline
                data={sparkline}
                dateLocale={dateLocale}
                emptyLabel={t('drawerNoActivity')}
                ariaLabel={t('chart30d')}
              />
            </div>
          </section>

          <section aria-label={t('drawerHeatmapAria')}>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[15px] font-semibold text-foreground">{t('drawerHeatmapTitle')}</h3>
            </div>
            <div className="rounded-lg border border-border bg-elevated p-3 overflow-x-auto">
              <div className="min-w-[480px]">
                <Heatmap7x24
                  data={heatmap}
                  dayLabels={DAY_LABELS}
                  lessLabel={t('drawerLess')}
                  moreLabel={t('drawerMore')}
                  tooltipBuilder={(day, hour, count) =>
                    t('heatmapCellTooltip', { day, hour, count })
                  }
                />
              </div>
            </div>
          </section>

          <section aria-label={t('drawerEvents')}>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[15px] font-semibold text-foreground">
                <Activity className="inline w-3.5 h-3.5 mr-1" />
                {t('drawerEvents')}
              </h3>
            </div>
            {timeline.length === 0 ? (
              <p className="text-[14px] text-foreground-muted">{t('drawerNoEvents')}</p>
            ) : (
              <ul className="space-y-1.5">
                {timeline.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-md border border-border/50 bg-elevated/50 px-3 py-2 text-[14px]"
                  >
                    <span className="font-medium">{eventLabel(e.event_type)}</span>
                    <span className="text-foreground-muted tabular-nums">
                      {formatDateTimeLocalized(e.created_at, dateLocale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={t('drawerRoleExplain')}>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[15px] font-semibold text-foreground">
                {t('drawerRoleExplain')}
              </h3>
            </div>
            {roleSources.length === 0 ? (
              <p className="text-[14px] text-foreground-muted">
                {t('drawerNoAccessExplain')}
              </p>
            ) : (
              <ul className="space-y-1.5 list-disc pl-4">
                {roleSources.map((entry, idx) => (
                  <RoleSourceItem
                    key={idx}
                    entry={entry}
                    dateLocale={dateLocale}
                    roleLabels={ROLE_LABELS}
                    t={t}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
