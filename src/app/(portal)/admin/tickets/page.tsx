import { z } from 'zod';
import Link from 'next/link';
import { and, desc, eq, isNotNull, not, or, sql } from 'drizzle-orm';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { tickets, organizations } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TicketIcon, Filter, AlertTriangle, Clock, X } from 'lucide-react';

const filtersSchema = z.object({
  created_between: z.enum(['7d', '30d', '90d']).optional(),
  sla: z.enum(['overdue', 'due-soon']).optional(),
  status: z
    .enum(['new', 'in_progress', 'waiting_client', 'resolved', 'closed'])
    .optional(),
});

const STATUS_TINTS: Record<string, string> = {
  new: 'oklch(0.625 0.130 250)',
  in_progress: 'oklch(0.625 0.140 80)',
  waiting_client: 'oklch(0.625 0.130 30)',
  resolved: 'oklch(0.625 0.140 155)',
  closed: 'oklch(0.600 0.020 260)',
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  new: 'ticketsStatusNew',
  in_progress: 'ticketsStatusInProgress',
  waiting_client: 'ticketsStatusWaiting',
  resolved: 'ticketsStatusResolved',
  closed: 'ticketsStatusClosed',
};

const PRIORITY_LABEL_KEYS: Record<string, string> = {
  low: 'ticketsPriorityLow',
  medium: 'ticketsPriorityMedium',
  high: 'ticketsPriorityHigh',
  urgent: 'ticketsPriorityUrgent',
};

function windowDays(win: '7d' | '30d' | '90d'): number {
  return win === '7d' ? 7 : win === '30d' ? 30 : 90;
}

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const t = await getTranslations('admin');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const raw = await searchParams;
  const parsed = filtersSchema.safeParse({
    created_between: typeof raw.created_between === 'string' ? raw.created_between : undefined,
    sla: typeof raw.sla === 'string' ? raw.sla : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const conditions = [];
  if (filters.created_between) {
    const days = windowDays(filters.created_between);
    conditions.push(sql`${tickets.created_at} > NOW() - (${days}::int * INTERVAL '1 day')`);
  }
  if (filters.sla === 'overdue') {
    conditions.push(
      and(
        isNotNull(tickets.resolution_due_at),
        sql`${tickets.resolution_due_at} < NOW()`,
        not(or(eq(tickets.status, 'resolved'), eq(tickets.status, 'closed'))!),
      )!,
    );
  } else if (filters.sla === 'due-soon') {
    conditions.push(
      and(
        isNotNull(tickets.resolution_due_at),
        sql`${tickets.resolution_due_at} > NOW()`,
        sql`${tickets.resolution_due_at} < NOW() + INTERVAL '24 hours'`,
        not(or(eq(tickets.status, 'resolved'), eq(tickets.status, 'closed'))!),
      )!,
    );
  }
  if (filters.status) {
    conditions.push(eq(tickets.status, filters.status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: tickets.id,
      number: tickets.number,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      created_at: tickets.created_at,
      resolution_due_at: tickets.resolution_due_at,
      org_id: tickets.organization_id,
      org_name: organizations.name,
      org_slug: organizations.slug,
    })
    .from(tickets)
    .leftJoin(organizations, eq(tickets.organization_id, organizations.id))
    .where(whereClause)
    .orderBy(desc(tickets.created_at))
    .limit(500);

  const activeFilters: string[] = [];
  if (filters.created_between)
    activeFilters.push(t('ticketsFilterCreatedBetween', { range: filters.created_between }));
  if (filters.sla === 'overdue') activeFilters.push(t('ticketsFilterSlaLateBadge'));
  if (filters.sla === 'due-soon') activeFilters.push(t('ticketsFilterSlaDueSoonBadge'));
  if (filters.status) {
    const key = STATUS_LABEL_KEYS[filters.status];
    activeFilters.push(
      t('ticketsFilterStatusBadge', { label: key ? t(key) : filters.status }),
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.140 80) 100%, white 12%), oklch(0.625 0.140 80))',
            borderColor: 'color-mix(in oklch, oklch(0.625 0.140 80) 50%, transparent)',
          }}
        >
          <TicketIcon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
            {t('ticketsPlatformTitle')}
          </h1>
          <p className="text-[15px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
            {t('ticketsCountLabel', { count: rows.length })}
            {rows.length >= 500 ? t('ticketsTruncated') : ''}
          </p>
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Filter className="w-3 h-3 text-foreground-subtle" />
              {activeFilters.map((f) => (
                <Badge key={f} variant="secondary" className="text-[12px]">
                  {f}
                </Badge>
              ))}
              <Link
                href="/admin/tickets"
                className="text-[13px] text-foreground-muted hover:text-primary inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                {tCommon('reset')}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink
          href="/admin/tickets?sla=overdue"
          active={filters.sla === 'overdue'}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label={t('ticketsFilterSlaOverdue')}
          tint="oklch(0.625 0.180 25)"
        />
        <FilterLink
          href="/admin/tickets?sla=due-soon"
          active={filters.sla === 'due-soon'}
          icon={<Clock className="w-3.5 h-3.5" />}
          label={t('ticketsFilterDueSoon')}
          tint="oklch(0.625 0.140 80)"
        />
        <FilterLink
          href="/admin/tickets?created_between=7d"
          active={filters.created_between === '7d'}
          icon={null}
          label={t('ticketsFilterCreated7d')}
          tint="oklch(0.625 0.130 250)"
        />
        <FilterLink
          href="/admin/tickets?created_between=30d"
          active={filters.created_between === '30d'}
          icon={null}
          label={t('ticketsFilterCreated30d')}
          tint="oklch(0.625 0.130 250)"
        />
      </div>

      <div className="rounded-xl border border-border bg-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">#</TableHead>
              <TableHead>{t('ticketsTableTitle')}</TableHead>
              <TableHead>{t('ticketsTableOrg')}</TableHead>
              <TableHead>{t('ticketsTableStatus')}</TableHead>
              <TableHead>{t('ticketsTablePriority')}</TableHead>
              <TableHead className="text-right">{t('ticketsTableSla')}</TableHead>
              <TableHead className="text-right">{t('ticketsTableCreated')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-foreground-muted text-[15px]"
                >
                  {t('ticketsEmpty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const statusTint = STATUS_TINTS[row.status];
                const statusLabelKey = STATUS_LABEL_KEYS[row.status];
                const priorityLabelKey = PRIORITY_LABEL_KEYS[row.priority];
                const overdue =
                  row.resolution_due_at &&
                  new Date(row.resolution_due_at) < new Date() &&
                  row.status !== 'resolved' &&
                  row.status !== 'closed';
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-[14px] tabular-nums">
                      #{row.number}
                    </TableCell>
                    <TableCell className="text-[15px] font-medium truncate max-w-[380px]">
                      <Link
                        href={`/clients/${row.org_slug}/tickets/${row.id}`}
                        className="hover:text-primary"
                      >
                        {row.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[14px]">
                      <Link
                        href={`/admin/clients/${row.org_slug}`}
                        className="text-foreground-muted hover:text-primary"
                      >
                        {row.org_name ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {statusLabelKey ? (
                        <Badge
                          variant="secondary"
                          style={{
                            background: `color-mix(in oklch, ${statusTint} 14%, transparent)`,
                            color: `color-mix(in oklch, ${statusTint} 100%, white 12%)`,
                          }}
                          className="text-[13px]"
                        >
                          {t(statusLabelKey)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{row.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[14px]">
                      {priorityLabelKey ? t(priorityLabelKey) : row.priority}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {row.resolution_due_at ? (
                        <span className={overdue ? 'text-destructive font-medium' : 'text-foreground-muted'}>
                          {new Date(row.resolution_due_at).toLocaleDateString(dateLocale, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      ) : (
                        <span className="text-foreground-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-[13px] text-foreground-muted tabular-nums">
                      {new Date(row.created_at).toLocaleDateString(dateLocale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  icon,
  label,
  tint,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  tint: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[14px] transition-colors"
      style={{
        borderColor: active
          ? `color-mix(in oklch, ${tint} 50%, transparent)`
          : 'var(--border)',
        background: active
          ? `color-mix(in oklch, ${tint} 14%, transparent)`
          : 'var(--elevated)',
        color: active ? tint : 'var(--foreground-muted)',
      }}
    >
      {icon}
      {label}
    </Link>
  );
}
