'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Tag as TagIcon,
  AlertTriangle,
  Flame,
  Zap,
  Leaf,
} from 'lucide-react';
import {
  TicketStatusLabels,
  TicketCategoryLabels,
  type TicketStatusType,
  type TicketCategoryType,
} from '@/types';
import { BulkActionsBar } from './bulk-actions-bar';
import { SlaBadge } from './sla-badge';
import { useTicketsSSE } from '@/lib/hooks/use-tickets-sse';
import { cn } from '@/lib/utils';

interface TicketRow {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  category: string;
  tags: string[];
  created_at: Date | string;
  closed_at: Date | string | null;
  resolution_due_at: Date | string | null;
}

interface TicketPriorityGroupsProps {
  tickets: TicketRow[];
  slug: string;
  canBulkAct: boolean;
  orgId?: string;
}

// ─── Design tokens (priority) ────────────────────────────────────────────────
//
// Ordre visuel volontaire Critique → Haute → Moyenne → Basse avec :
// - icône distincte par priorité pour reconnaissance rapide
// - tintClass (fill + border + text) pour hiérarchie visuelle
// - `pulse: true` sur Critique pour attirer l'œil (traffic-light = urgence)
// Références UX :
// - Smashing Magazine 2025, UX Strategies for Real-Time Dashboards
// - Linear board grouping Priority (https://linear.app/docs/board-layout)
// - F1Studioz Smart SaaS Dashboard Design Guide 2026

type PriorityMeta = {
  key: 'critical' | 'high' | 'medium' | 'low';
  Icon: typeof AlertTriangle;
  dotClass: string;
  tintClass: string;
  headerGradient: string;
  shadow: string;
  pulse: boolean;
  defaultOpen: boolean;
};

const PRIORITY_META: PriorityMeta[] = [
  {
    key: 'critical',
    Icon: AlertTriangle,
    dotClass: 'bg-rose-400',
    tintClass: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
    headerGradient:
      'linear-gradient(90deg, rgba(244,63,94,0.10) 0%, rgba(244,63,94,0.02) 60%, transparent 100%)',
    shadow: '0 0 32px -12px rgba(244,63,94,0.35)',
    pulse: true,
    defaultOpen: true,
  },
  {
    key: 'high',
    Icon: Flame,
    dotClass: 'bg-amber-400',
    tintClass: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    headerGradient:
      'linear-gradient(90deg, rgba(251,191,36,0.10) 0%, rgba(251,191,36,0.02) 60%, transparent 100%)',
    shadow: '0 0 24px -12px rgba(251,191,36,0.30)',
    pulse: false,
    defaultOpen: true,
  },
  {
    key: 'medium',
    Icon: Zap,
    dotClass: 'bg-sky-400',
    tintClass: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
    headerGradient:
      'linear-gradient(90deg, rgba(56,189,248,0.08) 0%, rgba(56,189,248,0.02) 60%, transparent 100%)',
    shadow: '0 0 24px -14px rgba(56,189,248,0.25)',
    pulse: false,
    defaultOpen: true,
  },
  {
    key: 'low',
    Icon: Leaf,
    dotClass: 'bg-zinc-400',
    tintClass: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
    headerGradient: 'none',
    shadow: 'none',
    pulse: false,
    defaultOpen: false,
  },
];

const PRIORITY_LABEL_KEYS: Record<PriorityMeta['key'], { label: string; sub: string }> = {
  critical: { label: 'priorityGroupCriticalLabel', sub: 'priorityGroupCriticalSub' },
  high: { label: 'priorityGroupHighLabel', sub: 'priorityGroupHighSub' },
  medium: { label: 'priorityGroupMediumLabel', sub: 'priorityGroupMediumSub' },
  low: { label: 'priorityGroupLowLabel', sub: 'priorityGroupLowSub' },
};

const statusStyles: Record<string, string> = {
  new: 'bg-sky-500/12 text-sky-300 border-sky-500/30',
  in_progress: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
  waiting_client: 'bg-fuchsia-500/12 text-fuchsia-300 border-fuchsia-500/30',
  resolved: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
  closed: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/25',
};

const categoryStyles: Record<string, string> = {
  bug: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  feature: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  support: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  maintenance: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

// localStorage key — format explicite sans structure entropique (évite
// faux-positif gitleaks `generic-api-key` sur les noms type `a.b.c.v1`).
const LS_COLLAPSE_KEY = 'pulseo_tickets_priority_collapse';

export function TicketPriorityGroups({
  tickets,
  slug,
  canBulkAct,
  orgId,
}: TicketPriorityGroupsProps) {
  const t = useTranslations('ticket');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useTicketsSSE(orgId);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_COLLAPSE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === 'object') setCollapsed(parsed);
      }
    } catch {
      /* localStorage peut être indisponible (Safari private) */
    } finally {
      setHydrated(true);
    }
  }, []);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !(prev[key] ?? false) };
      try {
        window.localStorage.setItem(LS_COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const buckets: Record<string, TicketRow[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };
    for (const t of tickets) {
      const key = buckets[t.priority] ? t.priority : 'medium';
      buckets[key].push(t);
    }
    return buckets;
  }, [tickets]);

  return (
    <>
      {canBulkAct && tickets.length > 0 && (
        <div className="flex items-center gap-3 mb-4 px-1">
          <span className="text-[13px] text-foreground-subtle">
            {selected.size > 0
              ? t('priorityGroupBulkSelected', { count: selected.size })
              : t('priorityGroupBulkHint')}
          </span>
        </div>
      )}

      <div className="space-y-4">
        {PRIORITY_META.map((meta) => {
          const rows = grouped[meta.key] ?? [];
          if (rows.length === 0) return null;

          const isCollapsed = hydrated
            ? collapsed[meta.key] ?? !meta.defaultOpen
            : !meta.defaultOpen;

          const statusBreakdown = rows.reduce<Record<string, number>>((acc, t) => {
            acc[t.status] = (acc[t.status] ?? 0) + 1;
            return acc;
          }, {});

          return (
            <section
              key={meta.key}
              className={cn(
                'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden transition-all',
              )}
              style={
                !isCollapsed && meta.shadow !== 'none'
                  ? { boxShadow: `${meta.shadow}, 0 8px 32px -12px rgba(0,0,0,0.35)` }
                  : { boxShadow: '0 8px 32px -12px rgba(0,0,0,0.35)' }
              }
            >
              <button
                type="button"
                onClick={() => toggleCollapse(meta.key)}
                aria-expanded={!isCollapsed}
                className={cn(
                  'group w-full flex items-center gap-4 px-5 py-4 text-left transition-colors',
                  'hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                )}
                style={{
                  backgroundImage:
                    meta.headerGradient !== 'none' ? meta.headerGradient : undefined,
                }}
              >
                <div className="relative w-3 h-3 shrink-0">
                  <span className={cn('absolute inset-0 rounded-full', meta.dotClass)} />
                  {meta.pulse && (
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-0 rounded-full animate-ping opacity-60',
                        meta.dotClass,
                      )}
                    />
                  )}
                </div>

                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border',
                      meta.tintClass,
                    )}
                  >
                    <meta.Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                      {t(PRIORITY_LABEL_KEYS[meta.key].label)}
                    </h3>
                    <p className="text-[13px] text-foreground-subtle">
                      {t(PRIORITY_LABEL_KEYS[meta.key].sub)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <Badge
                    variant="outline"
                    className={cn('h-6 text-[13px] px-2 font-semibold', meta.tintClass)}
                  >
                    {t('priorityGroupTicketsCount', { count: rows.length })}
                  </Badge>
                  <div className="hidden lg:flex items-center gap-1.5">
                    {Object.entries(statusBreakdown).map(([s, count]) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className={cn(
                          'h-5 text-[12px] px-1.5 font-medium tabular-nums',
                          statusStyles[s] ??
                            'bg-foreground-subtle/10 text-foreground-subtle border-foreground-subtle/25',
                        )}
                      >
                        {count} {TicketStatusLabels[s as TicketStatusType] ?? s}
                      </Badge>
                    ))}
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-foreground-subtle transition-transform duration-200',
                      isCollapsed ? '-rotate-90' : 'rotate-0',
                    )}
                  />
                </div>
              </button>

              <div
                className={cn(
                  'grid transition-[grid-template-rows] duration-300 ease-out',
                  isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
                )}
              >
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 space-y-1.5">
                    {rows.map((ticket) => {
                      const isChecked = selected.has(ticket.id);
                      return (
                        <div
                          key={ticket.id}
                          className={cn(
                            'group relative rounded-lg border transition-all duration-150',
                            isChecked
                              ? 'border-primary/50 bg-primary/[0.08] ring-1 ring-primary/30'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20',
                          )}
                        >
                          <div className="flex items-center gap-3 px-4 py-3">
                            {canBulkAct && (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelect(ticket.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer shrink-0"
                                aria-label={isChecked ? t('selectAriaOn') : t('selectAriaOff')}
                              />
                            )}

                            <Link
                              href={`/clients/${slug}/tickets/${ticket.id}`}
                              className="flex items-center justify-between gap-3 flex-1 min-w-0"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="text-[13px] font-mono text-foreground-subtle shrink-0 tabular-nums">
                                  #{ticket.number}
                                </span>
                                <span className="font-medium text-[15px] text-foreground truncate">
                                  {ticket.title}
                                </span>
                                {ticket.tags && ticket.tags.length > 0 && (
                                  <div className="hidden xl:flex items-center gap-1 shrink-0">
                                    <TagIcon className="w-3 h-3 text-foreground-subtle/60" />
                                    {ticket.tags.slice(0, 3).map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-1.5 py-0.5 text-[12px] font-medium bg-primary/10 text-[oklch(0.700_0.165_230)] rounded border border-primary/20"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                    {ticket.tags.length > 3 && (
                                      <span className="text-[12px] text-foreground-subtle">
                                        +{ticket.tags.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0 ml-4">
                                <SlaBadge
                                  createdAt={ticket.created_at}
                                  resolutionDueAt={ticket.resolution_due_at}
                                  closedAt={ticket.closed_at}
                                  className="hidden lg:inline-flex"
                                />
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'h-5 text-[12px] px-1.5 font-medium hidden lg:inline-flex',
                                    categoryStyles[ticket.category] ??
                                      'bg-foreground-subtle/10 text-foreground-subtle border-foreground-subtle/25',
                                  )}
                                >
                                  {TicketCategoryLabels[ticket.category as TicketCategoryType] ||
                                    ticket.category}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'h-5 text-[12px] px-1.5 font-medium',
                                    statusStyles[ticket.status] ??
                                      'bg-foreground-subtle/10 text-foreground-subtle border-foreground-subtle/25',
                                  )}
                                >
                                  {TicketStatusLabels[ticket.status as TicketStatusType] ||
                                    ticket.status}
                                </Badge>
                                <div className="flex items-center gap-1 text-[13px] text-foreground-subtle tabular-nums">
                                  <Clock className="w-3 h-3" />
                                  {new Date(ticket.created_at).toLocaleDateString(dateLocale, {
                                    day: '2-digit',
                                    month: '2-digit',
                                  })}
                                </div>
                                <ArrowRight className="w-3.5 h-3.5 text-foreground-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </Link>
                          </div>

                          <span
                            aria-hidden
                            className={cn(
                              'absolute left-0 top-2 bottom-2 w-0.5 rounded-full opacity-60',
                              meta.dotClass,
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {canBulkAct && (
        <BulkActionsBar
          selectedIds={Array.from(selected)}
          onClear={() => setSelected(new Set())}
        />
      )}

      <p className="text-[12px] text-foreground-subtle/60 mt-4 text-center">
        {t('priorityGroupCollapseHint')}
      </p>
    </>
  );
}
