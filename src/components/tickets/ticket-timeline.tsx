import { getTranslations, getLocale } from 'next-intl/server';
import {
  Plus,
  Pencil,
  GitBranch,
  CheckCircle2,
  ScrollText,
  Clock,
  Tag,
  Layers,
  Trash2,
  Activity,
} from 'lucide-react';
import { formatRelativeFr } from '@/lib/format/relative-time';
import { cn } from '@/lib/utils';

// Mapping actions audit_logs → UI (icône + couleur + libellé + template).
// L'action existe dans src/actions/tickets.ts : created / updated / status_changed
// / contract_assigned / time_updated / closed / tags_updated / bulk_status_changed
// / deleted.

type AuditLogEntry = {
  id: string;
  action: string;
  created_at: Date | string;
  changes: unknown;
  actor: {
    name: string | null;
    email: string;
  } | null;
};

interface TicketTimelineProps {
  logs: AuditLogEntry[];
}

type ActionConfig = {
  Icon: typeof Plus;
  ringClass: string;
  iconClass: string;
  labelKey: string;
};

const ACTION_CONFIG: Record<string, ActionConfig> = {
  created: {
    Icon: Plus,
    ringClass: 'ring-sky-500/40 bg-sky-500/15',
    iconClass: 'text-sky-300',
    labelKey: 'timelineActionCreated',
  },
  updated: {
    Icon: Pencil,
    ringClass: 'ring-violet-500/40 bg-violet-500/15',
    iconClass: 'text-violet-300',
    labelKey: 'timelineActionUpdated',
  },
  status_changed: {
    Icon: GitBranch,
    ringClass: 'ring-amber-500/40 bg-amber-500/15',
    iconClass: 'text-amber-300',
    labelKey: 'timelineActionStatusChanged',
  },
  contract_assigned: {
    Icon: ScrollText,
    ringClass: 'ring-cyan-500/40 bg-cyan-500/15',
    iconClass: 'text-cyan-300',
    labelKey: 'timelineActionContractAssigned',
  },
  time_updated: {
    Icon: Clock,
    ringClass: 'ring-indigo-500/40 bg-indigo-500/15',
    iconClass: 'text-indigo-300',
    labelKey: 'timelineActionTimeUpdated',
  },
  closed: {
    Icon: CheckCircle2,
    ringClass: 'ring-emerald-500/40 bg-emerald-500/15',
    iconClass: 'text-emerald-300',
    labelKey: 'timelineActionClosedAction',
  },
  tags_updated: {
    Icon: Tag,
    ringClass: 'ring-fuchsia-500/40 bg-fuchsia-500/15',
    iconClass: 'text-fuchsia-300',
    labelKey: 'timelineActionTagsUpdated',
  },
  bulk_status_changed: {
    Icon: Layers,
    ringClass: 'ring-amber-500/40 bg-amber-500/15',
    iconClass: 'text-amber-300',
    labelKey: 'timelineActionBulkStatusChanged',
  },
  deleted: {
    Icon: Trash2,
    ringClass: 'ring-rose-500/40 bg-rose-500/15',
    iconClass: 'text-rose-300',
    labelKey: 'timelineActionDeleted',
  },
};

const FALLBACK_ACTION: ActionConfig = {
  Icon: Activity,
  ringClass: 'ring-zinc-500/40 bg-zinc-500/15',
  iconClass: 'text-zinc-300',
  labelKey: 'timelineActionFallback',
};

// Type discriminant pour `changes` — Drizzle stocke le payload en JSONB et
// l'exposition type-safe est volontairement limitée (les shapes varient selon
// l'action). On cast à runtime champ par champ avec fallback vide.
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type TimelineT = (key: string, params?: Record<string, string | number>) => string;

function formatStatusChange(changes: unknown, t: TimelineT): string | null {
  if (!isRecord(changes)) return null;
  const status = changes.status;
  if (!isRecord(status)) return null;
  const oldVal = String(status.old_value ?? '');
  const newVal = String(status.new_value ?? '');
  const statusKey = (val: string) => {
    switch (val) {
      case 'new':
        return t('statusNew');
      case 'in_progress':
        return t('statusInProgress');
      case 'waiting_client':
        return t('statusWaitingClient');
      case 'resolved':
        return t('statusResolved');
      case 'closed':
        return t('statusClosed');
      default:
        return val;
    }
  };
  return `${statusKey(oldVal)} → ${statusKey(newVal)}`;
}

function priorityLabel(val: string, t: TimelineT): string {
  switch (val) {
    case 'low':
      return t('priorityLow');
    case 'medium':
      return t('priorityMedium');
    case 'high':
      return t('priorityHigh');
    case 'critical':
      return t('priorityCritical');
    default:
      return val;
  }
}

function categoryLabel(val: string, t: TimelineT): string {
  switch (val) {
    case 'bug':
      return t('categoryLabelBug');
    case 'feature':
      return t('categoryLabelFeature');
    case 'support':
      return t('categoryLabelSupport');
    case 'maintenance':
      return t('categoryLabelMaintenance');
    default:
      return val;
  }
}

function formatUpdatedDetails(changes: unknown, t: TimelineT): string | null {
  if (!isRecord(changes)) return null;
  const parts: string[] = [];
  if (typeof changes.title === 'string') parts.push(t('timelineUpdatedTitle'));
  if (typeof changes.description === 'string') parts.push(t('timelineUpdatedDescription'));
  if (typeof changes.priority === 'string') {
    parts.push(t('timelineUpdatedPriority', { label: priorityLabel(changes.priority, t) }));
  }
  if (typeof changes.category === 'string') {
    parts.push(t('timelineUpdatedCategory', { label: categoryLabel(changes.category, t) }));
  }
  if (Array.isArray(changes.tags)) parts.push(t('timelineUpdatedTags'));
  if (typeof changes.assigned_to_id === 'string') parts.push(t('timelineUpdatedAssignee'));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatTimeUpdate(changes: unknown): string | null {
  if (!isRecord(changes)) return null;
  const time = changes.time_spent_minutes;
  if (!isRecord(time)) return null;
  const oldH = Number(time.old_value ?? 0) / 60;
  const newH = Number(time.new_value ?? 0) / 60;
  return `${oldH.toFixed(1)} h → ${newH.toFixed(1)} h`;
}

function formatTagsUpdate(changes: unknown, t: TimelineT): string | null {
  if (!isRecord(changes)) return null;
  const tags = changes.tags;
  if (!isRecord(tags)) return null;
  const oldTags = Array.isArray(tags.old_value) ? tags.old_value.join(', ') : '—';
  const newTags = Array.isArray(tags.new_value) ? tags.new_value.join(', ') : '—';
  const none = t('timelineTagsNone');
  return `${oldTags || none} → ${newTags || none}`;
}

function formatContractAssigned(changes: unknown, t: TimelineT): string | null {
  if (!isRecord(changes)) return null;
  const contract = changes.contract_id;
  if (!isRecord(contract)) return null;
  return contract.new_value
    ? t('timelineContractLinkedLabel')
    : t('timelineContractUnlinkedLabel');
}

function buildSecondaryLine(
  action: string,
  changes: unknown,
  t: TimelineT,
): string | null {
  switch (action) {
    case 'status_changed':
      return formatStatusChange(changes, t);
    case 'updated':
      return formatUpdatedDetails(changes, t);
    case 'time_updated':
      return formatTimeUpdate(changes);
    case 'tags_updated':
      return formatTagsUpdate(changes, t);
    case 'contract_assigned':
      return formatContractAssigned(changes, t);
    default:
      return null;
  }
}

/**
 * Timeline chronologique des événements système du ticket (création, modifs,
 * changements de statut, clôture, etc.) à partir des rows `audit_logs` avec
 * `entity_type='ticket'` et `entity_id=ticket.id`.
 *
 * Séparé volontairement de `<CommentThread />` — les commentaires sont un
 * échange humain, la timeline est un journal machine.
 */
export async function TicketTimeline({ logs }: TicketTimelineProps) {
  const t = (await getTranslations('ticket')) as TimelineT;
  const locale = await getLocale();
  // Placeholder for future i18n of formatRelativeFr when EN locale is used.
  void locale;

  if (logs.length === 0) {
    return null;
  }

  // L'order se fait côté SQL (ASC). Défensif : on re-tri au cas où.
  const ordered = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="border border-white/10 bg-white/[0.03] backdrop-blur-xl rounded-xl">
      <div className="border-b border-white/10 px-5 py-3 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
          <Activity className="w-3.5 h-3.5 text-primary" />
        </div>
        <h2 className="text-[15px] font-semibold">{t('timelineTitle')}</h2>
        <span className="ml-auto text-[13px] text-foreground-subtle tabular-nums">
          {t('timelineEventsCount', { count: ordered.length })}
        </span>
      </div>

      <div className="relative px-5 py-4">
        {/* Ligne verticale de la timeline */}
        <span
          aria-hidden
          className="absolute left-[34px] top-4 bottom-4 w-px bg-white/10"
        />

        <ol className="space-y-4">
          {ordered.map((entry) => {
            const cfg = ACTION_CONFIG[entry.action] ?? FALLBACK_ACTION;
            const secondary = buildSecondaryLine(entry.action, entry.changes, t);
            const actorName =
              entry.actor?.name ?? entry.actor?.email ?? t('timelineUnknownActor');

            return (
              <li key={entry.id} className="relative flex items-start gap-3">
                {/* Dot icône */}
                <div
                  className={cn(
                    'relative z-10 w-9 h-9 rounded-full ring-1 flex items-center justify-center shrink-0 backdrop-blur-sm',
                    cfg.ringClass,
                  )}
                >
                  <cfg.Icon className={cn('w-4 h-4', cfg.iconClass)} strokeWidth={2.25} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5">
                    <span className="text-[15px] font-semibold text-foreground">
                      {actorName}
                    </span>
                    <span className="text-[15px] text-foreground-muted">
                      {t(cfg.labelKey)}
                    </span>
                    <span className="text-[13px] text-foreground-subtle/70 tabular-nums ml-auto">
                      {formatRelativeFr(entry.created_at)}
                    </span>
                  </div>
                  {secondary && (
                    <p className="mt-1 text-[14px] text-foreground-subtle leading-relaxed">
                      {secondary}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
