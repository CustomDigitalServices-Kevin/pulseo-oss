import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireSession, isUserAdmin } from '@/lib/auth/session';
import { listFeedback } from '@/actions/feedback';
import { FeedbackRow } from '@/components/feedback/feedback-row';
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
  type FeedbackType,
} from '@/lib/validations/feedback';
import { MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ status?: string; type?: string }>;
}

const STATUS_LABEL_KEYS: Record<FeedbackStatus, string> = {
  new: 'feedbackStatusNew',
  reviewed: 'feedbackStatusReviewed',
  accepted: 'feedbackStatusAccepted',
  rejected: 'feedbackStatusRejected',
};

export default async function AdminFeedbackPage({ searchParams }: Props) {
  const session = await requireSession();
  const admin = await isUserAdmin(session.user.id);
  if (!admin) redirect('/');
  const t = await getTranslations('admin');

  const params = await searchParams;
  const statusFilter: FeedbackStatus | undefined = FEEDBACK_STATUSES.includes(
    params.status as FeedbackStatus,
  )
    ? (params.status as FeedbackStatus)
    : undefined;
  const typeFilter: FeedbackType | undefined =
    params.type === 'bug' || params.type === 'feature' ? params.type : undefined;

  const items = await listFeedback({
    status: statusFilter,
    type: typeFilter,
  });

  const countByStatus: Record<FeedbackStatus, number> = {
    new: 0,
    reviewed: 0,
    accepted: 0,
    rejected: 0,
  };
  for (const it of items) countByStatus[it.status]++;

  const buildUrl = (next: { status?: string | null; type?: string | null }) => {
    const s = next.status === null ? undefined : (next.status ?? statusFilter);
    const t = next.type === null ? undefined : (next.type ?? typeFilter);
    const parts: string[] = [];
    if (s) parts.push(`status=${s}`);
    if (t) parts.push(`type=${t}`);
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-in">
      <header className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
          <MessageSquarePlus className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">
            {t('feedbackTitle')}
          </h1>
          <p className="text-[14px] text-foreground-muted">
            {t('feedbackSubtitle')}
          </p>
        </div>
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mr-1">
          {t('feedbackFilterStatusLabel')}
        </span>
        <Link
          href={buildUrl({ status: null })}
          className={cn(
            'inline-flex items-center h-7 px-3 rounded-full border text-[12px] font-medium transition-colors',
            !statusFilter
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'bg-canvas border-border text-foreground-muted hover:border-border-strong',
          )}
        >
          {t('feedbackFilterAll')} ({items.length})
        </Link>
        {FEEDBACK_STATUSES.map((s) => (
          <Link
            key={s}
            href={buildUrl({ status: s })}
            className={cn(
              'inline-flex items-center h-7 px-3 rounded-full border text-[12px] font-medium transition-colors',
              statusFilter === s
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-canvas border-border text-foreground-muted hover:border-border-strong',
            )}
          >
            {t(STATUS_LABEL_KEYS[s])} ({countByStatus[s]})
          </Link>
        ))}

        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mx-2">
          {t('feedbackFilterTypeLabel')}
        </span>
        <Link
          href={buildUrl({ type: null })}
          className={cn(
            'inline-flex items-center h-7 px-3 rounded-full border text-[12px] font-medium transition-colors',
            !typeFilter
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'bg-canvas border-border text-foreground-muted hover:border-border-strong',
          )}
        >
          {t('feedbackFilterAll')}
        </Link>
        <Link
          href={buildUrl({ type: 'feature' })}
          className={cn(
            'inline-flex items-center h-7 px-3 rounded-full border text-[12px] font-medium transition-colors',
            typeFilter === 'feature'
              ? 'bg-[oklch(0.680_0.180_310)]/15 border-[oklch(0.680_0.180_310)]/40 text-[oklch(0.680_0.180_310)]'
              : 'bg-canvas border-border text-foreground-muted hover:border-border-strong',
          )}
        >
          {t('feedbackFilterTypeFeature')}
        </Link>
        <Link
          href={buildUrl({ type: 'bug' })}
          className={cn(
            'inline-flex items-center h-7 px-3 rounded-full border text-[12px] font-medium transition-colors',
            typeFilter === 'bug'
              ? 'bg-[oklch(0.685_0.205_25)]/15 border-[oklch(0.685_0.205_25)]/40 text-[oklch(0.685_0.205_25)]'
              : 'bg-canvas border-border text-foreground-muted hover:border-border-strong',
          )}
        >
          {t('feedbackFilterTypeBug')}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-elevated/30 py-16 text-center">
          <p className="text-[14px] text-foreground-muted">{t('feedbackEmptyFilter')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <FeedbackRow
              key={f.id}
              id={f.id}
              type={f.type}
              title={f.title}
              description={f.description}
              status={f.status}
              adminNotes={f.admin_notes}
              createdAt={f.created_at}
              user={f.user}
              organization={f.organization}
            />
          ))}
        </div>
      )}
    </div>
  );
}
