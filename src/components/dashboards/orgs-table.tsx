import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TopOrgRow } from '@/lib/stats/aggregations';
import { cn } from '@/lib/utils';

type Provenance = 'group' | 'team' | 'direct';

type OrgsTableRow = TopOrgRow & { provenance?: Provenance };

export interface OrgsTableProps {
  rows: OrgsTableRow[];
  /** Text shown when `rows` is empty. If omitted, the localized default from `dashboard.orgsTableEmpty` is used. */
  emptyLabel?: string;
  className?: string;
}

const PROVENANCE_STYLES: Record<Provenance, { bg: string; fg: string; ring: string }> = {
  group: {
    bg: 'oklch(0.580 0.020 250 / 0.14)',
    fg: 'oklch(0.780 0.030 250)',
    ring: 'oklch(0.580 0.020 250 / 0.30)',
  },
  team: {
    bg: 'oklch(0.600 0.170 280 / 0.14)',
    fg: 'oklch(0.780 0.130 280)',
    ring: 'oklch(0.600 0.170 280 / 0.30)',
  },
  direct: {
    bg: 'oklch(0.560 0.010 270 / 0.14)',
    fg: 'oklch(0.780 0.010 270)',
    ring: 'oklch(0.560 0.010 270 / 0.30)',
  },
};

/**
 * Reusable orgs table — server component (async for i18n).
 */
export async function OrgsTable({
  rows,
  emptyLabel,
  className,
}: OrgsTableProps) {
  const t = await getTranslations('dashboard');
  const labels: Record<Provenance, string> = {
    group: t('provenanceGroup'),
    team: t('provenanceTeam'),
    direct: t('provenanceDirect'),
  };

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border bg-elevated p-8 text-center text-sm text-foreground-subtle',
          className,
        )}
      >
        {emptyLabel ?? t('orgsTableEmpty')}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-elevated overflow-hidden shadow-premium-sm',
        className,
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
              {t('orgsTableOrg')}
            </TableHead>
            <TableHead className="text-right text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
              {t('orgsTableOpen')}
            </TableHead>
            <TableHead className="text-right text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
              {t('orgsTableOverdue')}
            </TableHead>
            <TableHead className="text-right text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
              {t('orgsTableCreated30d')}
            </TableHead>
            <TableHead className="text-right text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
              {t('orgsTableProvenance')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.organization_id}>
              <TableCell>
                <Link
                  href={`/clients/${r.organization_slug}`}
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  {r.organization_name}
                </Link>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {r.open_tickets}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {r.overdue_tickets > 0 ? (
                  <span className="text-[oklch(0.685_0.205_25)] font-medium">
                    {r.overdue_tickets}
                  </span>
                ) : (
                  <span className="text-foreground-subtle">0</span>
                )}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-foreground-muted">
                {r.created_30d}
              </TableCell>
              <TableCell className="text-right">
                {r.provenance ? (
                  <ProvenancePill kind={r.provenance} label={labels[r.provenance]} />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProvenancePill({ kind, label }: { kind: Provenance; label: string }) {
  const s = PROVENANCE_STYLES[kind];
  return (
    <span
      data-provenance={kind}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ring-1"
      style={{ background: s.bg, color: s.fg, boxShadow: `0 0 0 1px ${s.ring} inset` }}
    >
      {label}
    </span>
  );
}

export default OrgsTable;
