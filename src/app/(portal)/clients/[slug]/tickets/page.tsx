import { getOrganization } from '@/actions/organizations';
import { db } from '@/lib/db';
import { tickets } from '@/lib/db/schema';
import { eq, and, desc, count, sql, ilike } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { getMemberRole, hasMinRole } from '@/lib/auth/require-role';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketFilters } from '@/components/tickets/ticket-filters';
import { Pagination } from '@/components/common/pagination';
import { ExportButton } from '@/components/common/export-button';
import { TicketPriorityGroups } from '@/components/tickets/ticket-priority-groups';
import { EmptyState } from '@/components/common/empty-state';
import {
  Plus,
  Ticket,
  AlertCircle,
  CircleDot,
} from 'lucide-react';

const TICKETS_PER_PAGE = 20;

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const status = search.status as string | undefined;
  const priority = search.priority as string | undefined;
  const category = search.category as string | undefined;
  const tag = search.tag as string | undefined;
  const qRaw = (search.q as string | undefined)?.trim() ?? '';
  // Limit query length pour éviter abus ; ilike naturellement paramétré donc pas de SQL-injection.
  const q = qRaw.slice(0, 100);
  const page = search.page as string | undefined;
  const sort = (search.sort as string) || 'created_at';

  const session = await requireSession();
  const t = await getTranslations('clients');
  const orgResult = await getOrganization(slug);
  if (!orgResult.success || !orgResult.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">{t('orgNotFound')}</p>
      </div>
    );
  }

  const org = orgResult.data;
  const memberInfo = await getMemberRole(session.user.id, org.id);
  const canExport = memberInfo ? hasMinRole(memberInfo.role, 'gestionnaire') : false;
  const canBulkAct = memberInfo ? hasMinRole(memberInfo.role, 'gestionnaire') : false;
  const pageNum = Math.max(1, parseInt(page || '1') || 1);

  const whereConditions = [eq(tickets.organization_id, org.id)];

  if (status && status !== 'all') {
    whereConditions.push(eq(tickets.status, status));
  }
  if (priority && priority !== 'all') {
    whereConditions.push(eq(tickets.priority, priority));
  }
  if (category && category !== 'all') {
    whereConditions.push(eq(tickets.category, category));
  }
  if (tag && tag !== 'all') {
    // Postgres array contains: tags @> ARRAY['<tag>']
    whereConditions.push(sql`${tickets.tags} @> ARRAY[${tag}]::text[]`);
  }
  if (q) {
    // Recherche full-text case-insensitive sur le titre. Index partiel possible
    // via pg_trgm à prévoir si la table tickets grossit (>100k rows/org).
    whereConditions.push(ilike(tickets.title, `%${q}%`));
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(tickets)
    .where(and(...whereConditions));

  const total = totalResult.count;
  const totalPages = Math.ceil(total / TICKETS_PER_PAGE);

  const ticketsList = await db
    .select()
    .from(tickets)
    .where(and(...whereConditions))
    .orderBy(
      sort === 'priority' ? desc(tickets.priority) : desc(tickets.created_at)
    )
    .limit(TICKETS_PER_PAGE)
    .offset((pageNum - 1) * TICKETS_PER_PAGE);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      {/* Header premium */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,#7c3aed_0%,#3b82f6_100%)] blur-[14px] opacity-40" />
            <div className="relative w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#7c3aed_0%,#3b82f6_100%)] flex items-center justify-center shadow-[0_8px_24px_-6px_rgba(124,58,237,0.5)]">
              <CircleDot className="w-5 h-5 text-white" strokeWidth={2.25} />
            </div>
          </div>
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
              {t('ticketsHeader')}
            </h1>
            <p className="text-[15px] text-foreground-muted mt-0.5">
              {t('ticketsFound', { count: total })}
              {status || priority || category || tag || q ? t('filtersActiveSuffix') : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canExport && (
            <ExportButton href={`/api/export/tickets?org_id=${org.id}`} />
          )}
          <Link href={`/clients/${slug}/tickets/new`} data-tour-id="new-ticket-cta">
            <Button variant="cta" size="xl" className="gap-2">
              <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
              {t('newTicketCta')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <TicketFilters slug={slug} />

      {/* Ticket list — glass card pour laisser transparaître le fond animé */}
      <Card className="border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-[15px] font-semibold flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
              <CircleDot className="w-3.5 h-3.5 text-primary" />
            </div>
            <span>
              {status || priority || category || tag || q
                ? t('ticketsFiltered', { count: total })
                : t('ticketsFound', { count: total })}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ticketsList.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title={t('ticketsNone')}
              description={
                status || priority || category || tag || q
                  ? t('ticketsNoneFiltered')
                  : t('ticketsNoneHint')
              }
              action={{
                label: t('createTicket'),
                href: `/clients/${slug}/tickets/new`,
              }}
            />
          ) : (
            <>
              <TicketPriorityGroups
                tickets={ticketsList}
                slug={slug}
                canBulkAct={canBulkAct}
                orgId={org.id}
              />

              {totalPages > 1 && (
                <div className="mt-6 pt-6 border-t">
                  <Pagination
                    currentPage={pageNum}
                    totalPages={totalPages}
                    basePath={`/clients/${slug}/tickets`}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
