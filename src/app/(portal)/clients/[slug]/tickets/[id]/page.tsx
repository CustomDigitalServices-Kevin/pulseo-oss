import { db } from '@/lib/db';
import { audit_logs } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TicketActions } from '@/components/tickets/ticket-actions';
import { TicketDelete } from '@/components/tickets/ticket-delete';
import { CommentThread } from '@/components/tickets/comment-thread';
import { TicketTimeline } from '@/components/tickets/ticket-timeline';
import { TicketAttachmentList } from '@/components/tickets/ticket-attachment-list';
import { TicketAttachmentUpload } from '@/components/tickets/ticket-attachment-upload';
import { SafeMarkdown } from '@/components/common/safe-markdown';
import { formatRelativeFr } from '@/lib/format/relative-time';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  UserCheck,
  ScrollText,
  Ticket,
  AlertTriangle,
  Flame,
  Zap,
  Leaf,
  Bug,
  Sparkles,
  LifeBuoy,
  Wrench,
  FileText,
  CheckCircle2,
  MapPin,
  ListOrdered,
} from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { getMemberRole, hasMinRole } from '@/lib/auth/require-role';
import { filterVisibleComments } from '@/lib/tickets/visible-comments';
import { getLocale, getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

// ─── Design tokens — alignés sur recent-tickets-grid + ticket-priority-groups
// pour garantir une identité visuelle constante à travers toutes les vues.

type PriorityKey = 'critical' | 'high' | 'medium' | 'low';
type StatusKey = 'new' | 'in_progress' | 'waiting_client' | 'resolved' | 'closed';
type CategoryKey = 'bug' | 'feature' | 'support' | 'maintenance';

const PRIORITY_META: Record<
  PriorityKey,
  {
    labelKey: string;
    Icon: typeof AlertTriangle;
    chipClass: string;
    cardShadow: string;
    ribbon: string;
    pulse: boolean;
    dotClass: string;
  }
> = {
  critical: {
    labelKey: 'priorityCritical',
    Icon: AlertTriangle,
    chipClass: 'bg-rose-500/20 text-rose-200 border-rose-500/50 ring-1 ring-rose-500/30',
    cardShadow: '0 0 40px -12px rgba(244,63,94,0.45), 0 0 0 1px rgba(244,63,94,0.15)',
    ribbon: 'linear-gradient(90deg, rgba(244,63,94,1) 0%, rgba(244,63,94,0.4) 70%, transparent 100%)',
    pulse: true,
    dotClass: 'bg-rose-400',
  },
  high: {
    labelKey: 'priorityHigh',
    Icon: Flame,
    chipClass: 'bg-amber-500/20 text-amber-200 border-amber-500/50 ring-1 ring-amber-500/30',
    cardShadow: '0 0 32px -12px rgba(251,191,36,0.35)',
    ribbon: 'linear-gradient(90deg, rgba(251,191,36,1) 0%, rgba(251,191,36,0.4) 70%, transparent 100%)',
    pulse: false,
    dotClass: 'bg-amber-400',
  },
  medium: {
    labelKey: 'priorityMedium',
    Icon: Zap,
    chipClass: 'bg-sky-500/15 text-sky-200 border-sky-500/40',
    cardShadow: '0 8px 32px -12px rgba(0,0,0,0.35)',
    ribbon: 'linear-gradient(90deg, rgba(56,189,248,0.9) 0%, rgba(56,189,248,0.3) 70%, transparent 100%)',
    pulse: false,
    dotClass: 'bg-sky-400',
  },
  low: {
    labelKey: 'priorityLow',
    Icon: Leaf,
    chipClass: 'bg-zinc-500/15 text-zinc-200 border-zinc-500/40',
    cardShadow: '0 8px 32px -12px rgba(0,0,0,0.35)',
    ribbon: 'linear-gradient(90deg, rgba(161,161,170,0.7) 0%, rgba(161,161,170,0.2) 70%, transparent 100%)',
    pulse: false,
    dotClass: 'bg-zinc-400',
  },
};

const STATUS_META: Record<
  StatusKey,
  {
    labelKey: string;
    Icon: typeof CheckCircle2;
    chipClass: string;
    badgeDot: string;
  }
> = {
  new: {
    labelKey: 'statusNew',
    Icon: Sparkles,
    chipClass: 'bg-sky-500/15 text-sky-200 border-sky-500/40',
    badgeDot: 'bg-sky-400',
  },
  in_progress: {
    labelKey: 'statusInProgress',
    Icon: Zap,
    chipClass: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
    badgeDot: 'bg-amber-400',
  },
  waiting_client: {
    labelKey: 'statusWaitingClient',
    Icon: Clock,
    chipClass: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/40',
    badgeDot: 'bg-fuchsia-400',
  },
  resolved: {
    labelKey: 'statusResolved',
    Icon: CheckCircle2,
    chipClass: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
    badgeDot: 'bg-emerald-400',
  },
  closed: {
    labelKey: 'statusClosed',
    Icon: CheckCircle2,
    chipClass: 'bg-zinc-500/15 text-zinc-200 border-zinc-500/40',
    badgeDot: 'bg-zinc-400',
  },
};

const CATEGORY_META: Record<
  CategoryKey,
  { labelKey: string; Icon: typeof Bug; chipClass: string }
> = {
  bug: { labelKey: 'categoryBug', Icon: Bug, chipClass: 'bg-rose-500/15 text-rose-200 border-rose-500/40' },
  feature: { labelKey: 'categoryFeature', Icon: Sparkles, chipClass: 'bg-violet-500/15 text-violet-200 border-violet-500/40' },
  support: { labelKey: 'categorySupport', Icon: LifeBuoy, chipClass: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40' },
  maintenance: { labelKey: 'categoryMaintenance', Icon: Wrench, chipClass: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40' },
};

// Petit chip réutilisable pour la section "Informations" (sidebar).
function MetaRow({
  Icon,
  label,
  children,
}: {
  Icon: typeof Calendar;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2 text-[14px] text-foreground-subtle">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-[15px] font-medium text-foreground truncate max-w-[170px] text-right">
        {children}
      </div>
    </div>
  );
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const t = await getTranslations('ticket');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';

  const org = await db.query.organizations.findFirst({
    where: (o, { eq }) => eq(o.slug, slug),
    columns: { id: true },
  });

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Ticket className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">{t('orgNotFound')}</p>
      </div>
    );
  }

  const ticket = await db.query.tickets.findFirst({
    where: (t, { and, eq }) => and(eq(t.id, id), eq(t.organization_id, org.id)),
    with: {
      creator: true,
      assignee: true,
      contract: true,
      comments: {
        with: { author: true },
        orderBy: (c, { desc }) => [desc(c.created_at)],
      },
      attachments: {
        orderBy: (a, { desc }) => [desc(a.created_at)],
      },
    },
  });

  const session = await requireSession();
  const memberInfo = await getMemberRole(session.user.id, org.id);
  const isGestionnaire = memberInfo ? hasMinRole(memberInfo.role, 'gestionnaire') : false;
  const isAdmin = memberInfo ? hasMinRole(memberInfo.role, 'admin') : false;
  const hasTimeSpent = Boolean(ticket?.time_spent_minutes && ticket.time_spent_minutes > 0);

  // Historique système du ticket — join actor via relation Drizzle.
  // Filtrage strict sur entity_type + entity_id ; l'IDOR est déjà couvert par la
  // vérification `organization_id === org.id` sur `ticket` en amont.
  const timelineLogs = ticket
    ? await db.query.audit_logs.findMany({
        where: and(
          eq(audit_logs.entity_type, 'ticket'),
          eq(audit_logs.entity_id, ticket.id),
        ),
        orderBy: [asc(audit_logs.created_at)],
        with: {
          actor: {
            columns: { name: true, email: true },
          },
        },
      })
    : [];

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Ticket className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">{t('notFound')}</p>
        <Link href={`/clients/${slug}/tickets`}>
          <Button variant="outline" size="sm" className="mt-4">
            {t('backToList')}
          </Button>
        </Link>
      </div>
    );
  }

  const priority = PRIORITY_META[ticket.priority as PriorityKey] ?? PRIORITY_META.medium;
  const status = STATUS_META[ticket.status as StatusKey] ?? STATUS_META.new;
  const category = CATEGORY_META[ticket.category as CategoryKey];
  const priorityLabel = t(priority.labelKey);
  const statusLabel = t(status.labelKey);
  const categoryLabel = category ? t(category.labelKey) : '';
  const PrioIcon = priority.Icon;
  const StatusIcon = status.Icon;
  const CatIcon = category?.Icon;

  return (
    <div className="p-6 lg:p-8 animate-in">
      {/* Breadcrumb */}
      <Link
        href={`/clients/${slug}/tickets`}
        className="inline-flex items-center gap-1.5 text-[14px] text-foreground-subtle hover:text-foreground transition-colors mb-5 group"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        {t('backToList')}
      </Link>

      {/* ══ HERO HEADER — glass card avec priorité / catégorie / statut en chips dominants ══ */}
      <div
        className="relative overflow-hidden rounded-2xl border bg-white/[0.04] backdrop-blur-xl mb-6"
        style={{
          boxShadow: priority.cardShadow,
          borderColor:
            ticket.priority === 'critical'
              ? 'rgba(244,63,94,0.35)'
              : ticket.priority === 'high'
                ? 'rgba(251,191,36,0.30)'
                : 'rgba(255,255,255,0.10)',
        }}
      >
        {/* Ribbon color-coded priorité — 4px en haut pour marquer fort */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[4px]"
          style={{ background: priority.ribbon }}
        />

        {/* Glow background pour critique + haute (visible en permanence) */}
        {(ticket.priority === 'critical' || ticket.priority === 'high') && (
          <span
            aria-hidden
            className="absolute -top-16 -right-16 w-64 h-64 rounded-full blur-3xl opacity-60"
            style={{
              background:
                ticket.priority === 'critical'
                  ? 'radial-gradient(circle, rgba(244,63,94,0.25) 0%, transparent 65%)'
                  : 'radial-gradient(circle, rgba(251,191,36,0.20) 0%, transparent 65%)',
            }}
          />
        )}

        <div className="relative p-6 lg:p-7">
          {/* Row 1 : 3 chips dominants priorité + catégorie + statut */}
          <div className="flex items-center flex-wrap gap-2 mb-4">
            <span
              className={cn(
                'inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[15px] font-semibold uppercase tracking-wider',
                priority.chipClass,
              )}
            >
              {priority.pulse && (
                <span className="relative flex w-2 h-2">
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-0 rounded-full animate-ping opacity-75',
                      priority.dotClass,
                    )}
                  />
                  <span className={cn('relative rounded-full w-2 h-2', priority.dotClass)} />
                </span>
              )}
              <PrioIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
              {t('priorityLabelChip', { label: priorityLabel })}
            </span>

            {category && CatIcon && (
              <span
                className={cn(
                  'inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[15px] font-semibold',
                  category.chipClass,
                )}
              >
                <CatIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                {categoryLabel}
              </span>
            )}

            <span
              className={cn(
                'inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[15px] font-semibold',
                status.chipClass,
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', status.badgeDot)} />
              <StatusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
              {statusLabel}
            </span>

            <div className="ml-auto flex items-center gap-3 text-[14px] text-foreground-subtle tabular-nums">
              <span className="font-mono text-[15px] text-foreground-muted">
                #{ticket.number}
              </span>
              <span className="text-foreground-subtle/40">·</span>
              <span>{formatRelativeFr(ticket.created_at)}</span>
            </div>
          </div>

          {/* Titre — gros, lisible, premium */}
          <h1 className="text-[28px] lg:text-[32px] font-semibold tracking-[-0.025em] leading-[1.15] text-foreground">
            {ticket.title}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ═══ Main column (2/3) ═══ */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description card */}
          <Card className="border border-white/10 bg-white/[0.03] backdrop-blur-xl">
            <div className="border-b border-white/10 px-5 py-3 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-primary" />
              </div>
              <h2 className="text-[15px] font-semibold">{t('description')}</h2>
            </div>
            <CardContent className="pt-5">
              <div className="prose prose-sm prose-invert max-w-none text-foreground/90 leading-relaxed">
                <SafeMarkdown>{ticket.description}</SafeMarkdown>
              </div>
            </CardContent>
          </Card>

          {/* Localisation (optionnelle) */}
          {ticket.location && ticket.location.trim().length > 0 && (
            <Card className="border border-white/10 bg-white/[0.03] backdrop-blur-xl">
              <div className="border-b border-white/10 px-5 py-3 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-[oklch(0.700_0.165_230)]/12 ring-1 ring-[oklch(0.700_0.165_230)]/25 flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-[oklch(0.700_0.165_230)]" />
                </div>
                <h2 className="text-[15px] font-semibold">{t('location')}</h2>
              </div>
              <CardContent className="pt-5">
                <p className="text-[14px] text-foreground/90 leading-relaxed">{ticket.location}</p>
              </CardContent>
            </Card>
          )}

          {/* Scénario d'étapes (optionnel) — bug = reproduction, feature = fonctionnement attendu */}
          {Array.isArray(ticket.scenario_steps) && ticket.scenario_steps.length > 0 && (
            <Card className="border border-white/10 bg-white/[0.03] backdrop-blur-xl">
              <div className="border-b border-white/10 px-5 py-3 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-[oklch(0.680_0.180_310)]/12 ring-1 ring-[oklch(0.680_0.180_310)]/25 flex items-center justify-center">
                  <ListOrdered className="w-3.5 h-3.5 text-[oklch(0.680_0.180_310)]" />
                </div>
                <h2 className="text-[15px] font-semibold">
                  {ticket.category === 'bug'
                    ? t('scenarioTitleBug')
                    : ticket.category === 'feature'
                      ? t('scenarioTitleFeature')
                      : t('scenarioTitleDefault')}
                </h2>
                <span className="ml-auto text-[12px] text-foreground-subtle tabular-nums">
                  {t('scenarioStepsCount', { count: ticket.scenario_steps.length })}
                </span>
              </div>
              <CardContent className="pt-5">
                <ol className="space-y-2.5">
                  {(ticket.scenario_steps as { index: number; text: string }[])
                    .slice()
                    .sort((a, b) => a.index - b.index)
                    .map((step, i, arr) => {
                      const isLast = i === arr.length - 1;
                      const isBugFinal = isLast && ticket.category === 'bug' && arr.length > 1;
                      return (
                        <li
                          key={`${step.index}-${i}`}
                          className="flex items-start gap-3"
                        >
                          <div
                            className={cn(
                              'shrink-0 w-7 h-7 rounded-md text-[13px] font-semibold flex items-center justify-center tabular-nums ring-1',
                              isBugFinal
                                ? 'bg-destructive/15 ring-destructive/35 text-destructive'
                                : 'bg-primary/12 ring-primary/25 text-primary',
                            )}
                          >
                            {i + 1}
                          </div>
                          <p className="text-[14px] text-foreground/90 leading-relaxed mt-0.5 flex-1">
                            {step.text}
                          </p>
                        </li>
                      );
                    })}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Timeline système — entre Description et Commentaires */}
          <TicketTimeline logs={timelineLogs} />

          {/* Comments — les commentaires internes sont filtrés côté serveur
              pour tout viewer non-staff (fuite contenu interne sinon) */}
          <CommentThread
            ticketId={ticket.id}
            comments={filterVisibleComments(ticket.comments, isGestionnaire).map((c) => ({
              ...c,
              authorName: c.author?.name || c.author?.email || 'Inconnu',
            }))}
          />

          {/* Attachments */}
          <TicketAttachmentUpload ticketId={ticket.id} />

          {ticket.attachments && ticket.attachments.length > 0 && (
            <TicketAttachmentList
              attachments={ticket.attachments}
              ticketId={ticket.id}
              organizationId={ticket.organization_id}
            />
          )}
        </div>

        {/* ═══ Sidebar (1/3) ═══ */}
        <div className="space-y-4">
          {/* Card meta-info — plus compact, séparations discrètes */}
          <Card className="border border-white/10 bg-white/[0.03] backdrop-blur-xl">
            <div className="border-b border-white/10 px-5 py-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
                {t('info')}
              </h2>
            </div>
            <CardContent className="px-5 py-1 divide-y divide-white/5">
              <MetaRow Icon={User} label={t('creator')}>
                {ticket.creator?.name || ticket.creator?.email || '—'}
              </MetaRow>

              {ticket.assignee && (
                <MetaRow Icon={UserCheck} label={t('assignee')}>
                  {ticket.assignee.name || ticket.assignee.email}
                </MetaRow>
              )}

              {(isGestionnaire || hasTimeSpent) && (
                <MetaRow Icon={Clock} label={t('timeSpent')}>
                  <span className="font-mono">
                    {((ticket.time_spent_minutes || 0) / 60).toFixed(1)} h
                  </span>
                </MetaRow>
              )}

              {ticket.contract && isGestionnaire && (
                <MetaRow Icon={ScrollText} label={t('contract')}>
                  {ticket.contract.name}
                </MetaRow>
              )}

              <MetaRow Icon={Calendar} label={t('createdOn')}>
                {new Date(ticket.created_at).toLocaleDateString(dateLocale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </MetaRow>

              {ticket.closed_at && (
                <MetaRow Icon={Calendar} label={t('closedOn')}>
                  {new Date(ticket.closed_at).toLocaleDateString(dateLocale, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </MetaRow>
              )}
            </CardContent>
          </Card>

          {/* Actions — gestionnaire+ only */}
          {isGestionnaire && (
            <TicketActions ticket={ticket} canManage={isGestionnaire} />
          )}

          {/* Delete — admin only */}
          {isAdmin && (
            <TicketDelete
              ticketId={ticket.id}
              ticketNumber={ticket.number}
              slug={slug}
            />
          )}
        </div>
      </div>
    </div>
  );
}

