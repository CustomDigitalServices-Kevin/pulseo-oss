'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Clock, Tag as TagIcon } from 'lucide-react';
import {
  TicketStatusLabels,
  TicketPriorityLabels,
  TicketCategoryLabels,
  type TicketStatusType,
  type TicketPriorityType,
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

interface TicketListWithBulkProps {
  tickets: TicketRow[];
  slug: string;
  canBulkAct: boolean;
  /** Org UUID — used to subscribe to the SSE stream of ticket updates. */
  orgId?: string;
}

// Dark-tuned status palette — translucent fills that read on the elevated bg
const statusStyles: Record<string, string> = {
  new: 'bg-[oklch(0.625_0.205_264)]/12 text-[oklch(0.700_0.165_230)] border-[oklch(0.625_0.205_264)]/30',
  in_progress: 'bg-[oklch(0.795_0.155_80)]/12 text-[oklch(0.795_0.155_80)] border-[oklch(0.795_0.155_80)]/30',
  waiting_client: 'bg-[oklch(0.680_0.180_310)]/12 text-[oklch(0.680_0.180_310)] border-[oklch(0.680_0.180_310)]/30',
  resolved: 'bg-[oklch(0.700_0.165_155)]/12 text-[oklch(0.700_0.165_155)] border-[oklch(0.700_0.165_155)]/30',
  closed: 'bg-foreground-subtle/10 text-foreground-subtle border-foreground-subtle/25',
};

const priorityStyles: Record<string, { class: string; dot: string }> = {
  low: { class: 'text-foreground-subtle', dot: 'bg-foreground-subtle' },
  medium: { class: 'text-[oklch(0.700_0.165_230)]', dot: 'bg-[oklch(0.700_0.165_230)]' },
  high: { class: 'text-[oklch(0.795_0.155_80)]', dot: 'bg-[oklch(0.795_0.155_80)]' },
  critical: { class: 'text-destructive', dot: 'bg-destructive' },
};

// Codes couleurs catégories — identité visuelle cohérente avec filtres + form
const categoryStyles: Record<string, string> = {
  bug: 'bg-rose-500/12 text-rose-300 border-rose-500/30',
  feature: 'bg-violet-500/12 text-violet-300 border-violet-500/30',
  support: 'bg-cyan-500/12 text-cyan-300 border-cyan-500/30',
  maintenance: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
};

/**
 * Client-side ticket list with optional multi-selection and bulk action bar.
 *
 * When canBulkAct is true, each row shows a checkbox; selecting any row
 * shows the floating BulkActionsBar at the bottom of the viewport.
 */
export function TicketListWithBulk({
  tickets,
  slug,
  canBulkAct,
  orgId,
}: TicketListWithBulkProps) {
  const t = useTranslations('ticket');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Subscribe to SSE updates for the org so the list refreshes automatically
  // when another user creates or modifies a ticket.
  useTicketsSSE(orgId);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === tickets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tickets.map((t) => t.id)));
    }
  };

  const allSelected = tickets.length > 0 && selected.size === tickets.length;
  const hasSelection = selected.size > 0;

  return (
    <>
      {canBulkAct && tickets.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-1">
          <label className="flex items-center gap-2 text-[13px] text-foreground-subtle cursor-pointer hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded border-border accent-primary"
              aria-label={t('selectAllAria')}
            />
            <span>
              {hasSelection
                ? t('selectedOf', { count: selected.size, total: tickets.length })
                : t('selectAllLabel', { count: tickets.length })}
            </span>
          </label>
        </div>
      )}

      <div className="space-y-1.5 animate-in-stagger">
        {tickets.map((ticket) => {
          const pStyle = priorityStyles[ticket.priority] || priorityStyles.medium;
          const isChecked = selected.has(ticket.id);
          return (
            <div
              key={ticket.id}
              className={cn(
                'group relative border rounded-lg list-item-premium backdrop-blur-sm transition-colors',
                isChecked
                  ? 'border-primary/50 bg-primary/[0.08] ring-1 ring-primary/30'
                  : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
              )}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                {canBulkAct && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      toggle(ticket.id);
                    }}
                    className="shrink-0"
                    aria-label={isChecked ? t('selectAriaOn') : t('selectAriaOff')}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(ticket.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer"
                    />
                  </button>
                )}

                <Link
                  href={`/clients/${slug}/tickets/${ticket.id}`}
                  className="flex items-center justify-between gap-3 flex-1 min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Priority dot */}
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${pStyle.dot}`}
                      title={
                        TicketPriorityLabels[ticket.priority as TicketPriorityType] ??
                        ticket.priority
                      }
                    />

                    {/* Number */}
                    <span className="text-[13px] font-mono text-foreground-subtle shrink-0 tabular-nums">
                      #{ticket.number}
                    </span>

                    {/* Title */}
                    <span className="font-medium text-[15px] text-foreground truncate">
                      {ticket.title}
                    </span>

                    {/* Tags */}
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
                    {/* SLA badge */}
                    <SlaBadge
                      createdAt={ticket.created_at}
                      resolutionDueAt={ticket.resolution_due_at}
                      closedAt={ticket.closed_at}
                      className="hidden lg:inline-flex"
                    />

                    {/* Category — badge color-coded (visual parity avec filtres) */}
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-5 text-[12px] px-1.5 font-medium hidden lg:inline-flex',
                        categoryStyles[ticket.category] ?? 'bg-foreground-subtle/10 text-foreground-subtle border-foreground-subtle/25',
                      )}
                    >
                      {TicketCategoryLabels[ticket.category as TicketCategoryType] ||
                        ticket.category}
                    </Badge>

                    {/* Status badge */}
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-5 text-[12px] px-1.5 font-medium',
                        statusStyles[ticket.status] ?? 'bg-foreground-subtle/10 text-foreground-subtle border-foreground-subtle/25'
                      )}
                    >
                      {TicketStatusLabels[ticket.status as TicketStatusType] ||
                        ticket.status}
                    </Badge>

                    {/* Priority label */}
                    <span
                      className={`text-[13px] font-medium hidden md:inline ${pStyle.class}`}
                    >
                      {TicketPriorityLabels[ticket.priority as TicketPriorityType] ||
                        ticket.priority}
                    </span>

                    {/* Date */}
                    <div className="flex items-center gap-1 text-[13px] text-foreground-subtle tabular-nums">
                      <Clock className="w-3 h-3" />
                      {new Date(ticket.created_at).toLocaleDateString(dateLocale, {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="w-3.5 h-3.5 text-foreground-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {canBulkAct && (
        <BulkActionsBar
          selectedIds={Array.from(selected)}
          onClear={() => setSelected(new Set())}
        />
      )}
    </>
  );
}
