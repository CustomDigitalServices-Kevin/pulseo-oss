import { computeSlaStatus, type SlaStatus } from '@/lib/sla';
import { Clock, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlaBadgeProps {
  createdAt: Date | string | null;
  resolutionDueAt: Date | string | null;
  closedAt: Date | string | null;
  className?: string;
  /** Show only icon (compact mode for tight rows). */
  iconOnly?: boolean;
  /**
   * Optional reference "now" used to compute SLA status. Defaults to the
   * runtime `new Date()`. Passing this makes the component deterministic
   * and testable — without it the badge output depends on system time.
   */
  now?: Date;
}

const STATUS_STYLES: Record<SlaStatus, { class: string; icon: typeof Clock }> = {
  on_time: {
    class: 'bg-[oklch(0.700_0.165_155)]/12 text-[oklch(0.700_0.165_155)] border-[oklch(0.700_0.165_155)]/30',
    icon: Clock,
  },
  at_risk: {
    class: 'bg-[oklch(0.795_0.155_80)]/12 text-[oklch(0.795_0.155_80)] border-[oklch(0.795_0.155_80)]/30',
    icon: AlertTriangle,
  },
  overdue: {
    class: 'bg-destructive/12 text-destructive border-destructive/30',
    icon: Zap,
  },
  met: {
    class: 'bg-[oklch(0.700_0.165_155)]/12 text-[oklch(0.700_0.165_155)] border-[oklch(0.700_0.165_155)]/30',
    icon: CheckCircle2,
  },
  no_sla: {
    class: 'bg-canvas text-foreground-subtle border-border',
    icon: Clock,
  },
};

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Visual badge displaying the SLA status of a ticket.
 * Returns null if no SLA is set on the ticket's contract.
 */
export function SlaBadge({
  createdAt,
  resolutionDueAt,
  closedAt,
  className,
  iconOnly = false,
  now,
}: SlaBadgeProps) {
  const info = computeSlaStatus(
    toDate(createdAt),
    toDate(resolutionDueAt),
    toDate(closedAt),
    now
  );

  if (info.status === 'no_sla') return null;

  const { class: classes, icon: Icon } = STATUS_STYLES[info.status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[13px] font-medium',
        classes,
        className
      )}
      title={info.label}
    >
      <Icon className="w-3 h-3" />
      {!iconOnly && <span>{info.label}</span>}
    </span>
  );
}
