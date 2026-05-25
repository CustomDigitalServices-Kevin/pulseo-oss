import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { Ticket, MessageCircle, LogIn, Activity } from 'lucide-react';
import { formatRelativeFr } from '@/lib/format/relative-time';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

export type ActivityScope =
  | { type: 'global' }
  | { type: 'org'; id: string }
  | { type: 'group'; id: string };

export interface ActivityFeedProps {
  scope: ActivityScope;
  /** Max rows to display. Defaults to 10. */
  limit?: number;
  className?: string;
}

// ─── Row schema (runtime-validated) ──────────────────────────────────────────

const activityRowSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  created_at: z
    .union([z.string(), z.date()])
    .transform((v) => (v instanceof Date ? v : new Date(v))),
  resource_id: z.string().nullable(),
  user_email: z.string().nullable(),
  ticket_number: z.number().nullable(),
  ticket_title: z.string().nullable(),
  org_slug: z.string().nullable(),
});

type Row = z.infer<typeof activityRowSchema>;

// Sentinel used as a trivially-satisfied WHERE prefix so we can always
// concatenate `${scopeClause}` without worrying about "WHERE" vs "AND".
const EMPTY_CLAUSE = sql`AND 1 = 1`;

type MessageTranslator = Awaited<ReturnType<typeof getTranslations<'dashboard'>>>;

/**
 * Human message per event type — i18n via dashboard namespace.
 */
function messageFor(row: Row, t: MessageTranslator): string {
  const who = row.user_email ?? t('activityFeedUnknownUser');
  switch (row.event_type) {
    case 'login':
      return t('activityLogin', { who });
    case 'ticket_created':
      return row.ticket_title
        ? t('activityTicketCreated', {
            who,
            number: row.ticket_number ?? '',
            title: row.ticket_title,
          })
        : t('activityTicketCreatedNoTitle', { who });
    case 'ticket_commented':
      return row.ticket_title
        ? t('activityTicketCommented', {
            who,
            number: row.ticket_number ?? '',
            title: row.ticket_title,
          })
        : t('activityTicketCommentedNoTitle', { who });
    default:
      return `${who}: ${row.event_type}`;
  }
}

function IconFor({ type }: { type: string }) {
  const common = 'w-3.5 h-3.5';
  switch (type) {
    case 'login':
      return <LogIn className={cn(common, 'text-foreground-subtle')} />;
    case 'ticket_created':
      return <Ticket className={cn(common, 'text-primary')} />;
    case 'ticket_commented':
      return <MessageCircle className={cn(common, 'text-[oklch(0.680_0.180_310)]')} />;
    default:
      return <Activity className={cn(common, 'text-foreground-subtle')} />;
  }
}

function deepLink(row: Row): string | null {
  if (
    (row.event_type === 'ticket_created' || row.event_type === 'ticket_commented') &&
    row.resource_id &&
    row.org_slug
  ) {
    return `/clients/${row.org_slug}/tickets/${row.resource_id}`;
  }
  return null;
}

function EmptyFeed({ className, label }: { className?: string; label: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-elevated p-8 text-center text-sm text-foreground-subtle',
        className,
      )}
    >
      {label}
    </div>
  );
}

/**
 * Server component — queries `user_activity_events` joined with `tickets` and
 * `organizations`, scoped optionally to an org or a group, ordered by most
 * recent, capped at `limit` (default 10).
 */
export async function ActivityFeed({
  scope,
  limit = 10,
  className,
}: ActivityFeedProps) {
  const limitInt = Math.max(1, Math.min(100, Math.floor(limit)));
  const t = await getTranslations('dashboard');

  let scopeClause = EMPTY_CLAUSE;
  if (scope.type === 'org') {
    scopeClause = sql`AND e.organization_id = ${scope.id}`;
  } else if (scope.type === 'group') {
    scopeClause = sql`AND e.organization_id IN (
      SELECT id FROM organizations WHERE group_id = ${scope.id}
    )`;
  }

  const result = await db.execute(sql`
    SELECT
      e.id,
      e.event_type,
      e.created_at,
      e.resource_id,
      u.email AS user_email,
      t.number AS ticket_number,
      t.title AS ticket_title,
      o.slug AS org_slug
    FROM user_activity_events e
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN tickets t
      ON t.id = e.resource_id
      AND e.event_type IN ('ticket_created','ticket_commented')
    LEFT JOIN organizations o ON o.id = e.organization_id
    WHERE 1 = 1
      ${scopeClause}
    ORDER BY e.created_at DESC
    LIMIT ${limitInt}
  `);

  const rawRows = (result as unknown as { rows?: unknown[] }).rows ?? [];
  const parsed = z.array(activityRowSchema).safeParse(rawRows);
  if (!parsed.success) {
    logger.warn('[ACTIVITY-FEED] unexpected row shape', {
      scope,
      issueCount: parsed.error.issues.length,
      firstIssue: parsed.error.issues[0],
    });
    return <EmptyFeed className={className} label={t('activityEmpty')} />;
  }
  const rows = parsed.data;

  if (rows.length === 0) {
    return <EmptyFeed className={className} label={t('activityEmpty')} />;
  }

  return (
    <ul
      className={cn(
        'rounded-xl border border-border bg-elevated shadow-premium-sm divide-y divide-border',
        className,
      )}
    >
      {rows.map((row) => {
        const href = deepLink(row);
        const msg = messageFor(row, t);
        const ts = formatRelativeFr(row.created_at);
        const content = (
          <div className="flex items-start gap-2.5 px-3 py-2.5">
            <div className="w-6 h-6 rounded-md bg-muted/40 border border-border/60 flex items-center justify-center shrink-0 mt-0.5">
              <IconFor type={row.event_type} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground truncate">{msg}</p>
              <p className="text-[13px] text-foreground-subtle mt-0.5">{ts}</p>
            </div>
          </div>
        );
        return (
          <li key={row.id}>
            {href ? (
              <Link
                href={href}
                className="block transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 outline-none"
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default ActivityFeed;
