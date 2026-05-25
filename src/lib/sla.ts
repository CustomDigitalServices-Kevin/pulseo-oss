/**
 * SLA computation utilities for Pulseo tickets.
 *
 * SLAs are defined at the contract level:
 *   - sla_response_hours: time to first response
 *   - sla_resolution_hours: time to resolution
 *
 * When a ticket is linked to a contract with SLAs, the resolution_due_at
 * field is computed at creation time. The responded_at field is set
 * when a gestionnaire posts the first comment.
 */

export type SlaStatus = 'on_time' | 'at_risk' | 'overdue' | 'met' | 'no_sla';

export interface SlaInfo {
  status: SlaStatus;
  /** Milliseconds remaining (negative if overdue). */
  remainingMs: number;
  /** Human-readable label in French. */
  label: string;
}

/** Threshold for "at risk" — under 25% of SLA window remaining. */
const AT_RISK_RATIO = 0.25;

/**
 * Compute SLA status for a ticket.
 *
 * @param createdAt When the ticket was created
 * @param resolutionDueAt When the ticket must be resolved (null if no SLA)
 * @param closedAt When the ticket was actually closed (null if still open)
 * @param now Reference time, defaults to Date.now()
 */
export function computeSlaStatus(
  createdAt: Date | null,
  resolutionDueAt: Date | null,
  closedAt: Date | null,
  now: Date = new Date()
): SlaInfo {
  if (!resolutionDueAt) {
    return { status: 'no_sla', remainingMs: 0, label: 'Pas de SLA' };
  }

  const due = resolutionDueAt.getTime();
  const nowMs = now.getTime();
  const remainingMs = due - nowMs;

  // Resolved before or after the deadline.
  if (closedAt) {
    const closed = closedAt.getTime();
    return closed <= due
      ? { status: 'met', remainingMs: due - closed, label: 'SLA respecté' }
      : {
          status: 'overdue',
          remainingMs: due - closed,
          label: `Dépassé de ${formatDuration(closed - due)}`,
        };
  }

  // Still open.
  if (remainingMs < 0) {
    return {
      status: 'overdue',
      remainingMs,
      label: `En retard de ${formatDuration(-remainingMs)}`,
    };
  }

  if (createdAt) {
    const totalWindow = due - createdAt.getTime();
    if (totalWindow > 0 && remainingMs / totalWindow < AT_RISK_RATIO) {
      return {
        status: 'at_risk',
        remainingMs,
        label: `À risque — ${formatDuration(remainingMs)} restantes`,
      };
    }
  }

  return {
    status: 'on_time',
    remainingMs,
    label: `${formatDuration(remainingMs)} restantes`,
  };
}

/**
 * Compute the resolution_due_at date for a new ticket given a contract SLA.
 */
export function computeResolutionDue(
  createdAt: Date,
  slaResolutionHours: number | null
): Date | null {
  if (slaResolutionHours == null || slaResolutionHours <= 0) return null;
  return new Date(createdAt.getTime() + slaResolutionHours * 60 * 60 * 1000);
}

/**
 * Format a duration in milliseconds as a short French human string.
 * Examples: "5 min", "2 h", "3 j 4 h", "12 j"
 */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    const remHours = hours - days * 24;
    return remHours > 0 ? `${days} j ${remHours} h` : `${days} j`;
  }
  if (hours >= 1) {
    return `${hours} h`;
  }
  return `${Math.max(1, minutes)} min`;
}
