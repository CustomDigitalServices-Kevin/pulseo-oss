import { db } from '@/lib/db';
import { audit_logs } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { getLocale, getTranslations } from 'next-intl/server';
import { SpotlightCard } from '@/components/common/spotlight-card';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  LogIn,
  LogOut,
  Ticket,
  ScrollText,
  MessageSquare,
  Paperclip,
  Building2,
  Link2,
  FileText,
  RefreshCw,
  Trash2,
  Edit,
  Clock,
  ClipboardList,
  Activity,
  TrendingUp,
} from 'lucide-react';

const ACTION_LABEL_KEYS: Record<string, string> = {
  login: 'auditActionSignIn',
  logout: 'auditActionSignOut',
  create_ticket: 'auditActionCreateTicket',
  update_ticket_status: 'auditActionUpdateTicketStatus',
  close_ticket: 'auditActionCloseTicket',
  assign_contract: 'auditActionAssignContract',
  update_time_spent: 'auditActionUpdateTimeSpent',
  create_comment: 'auditActionCreateComment',
  upload_attachment: 'auditActionUploadAttachment',
  delete_attachment: 'auditActionDeleteAttachment',
  create_org: 'auditActionCreateOrg',
  update_org: 'auditActionUpdateOrg',
  create_contract: 'auditActionCreateContract',
  update_contract: 'auditActionUpdateContract',
  terminate_contract: 'auditActionTerminateContract',
  create_magic_link: 'auditActionCreateMagicLink',
  revoke_magic_link: 'auditActionRevokeMagicLink',
  upload_document: 'auditActionUploadDocument',
  delete_document: 'auditActionDeleteDocument',
  sync_qonto: 'auditActionSyncQonto',
};

const ACTION_ICONS: Record<string, typeof Shield> = {
  login: LogIn,
  logout: LogOut,
  create_ticket: Ticket,
  update_ticket_status: Edit,
  close_ticket: Ticket,
  assign_contract: ScrollText,
  update_time_spent: Clock,
  create_comment: MessageSquare,
  upload_attachment: Paperclip,
  delete_attachment: Trash2,
  create_org: Building2,
  update_org: Building2,
  create_contract: ScrollText,
  update_contract: ScrollText,
  terminate_contract: ScrollText,
  create_magic_link: Link2,
  revoke_magic_link: Link2,
  upload_document: FileText,
  delete_document: Trash2,
  sync_qonto: RefreshCw,
};

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-[oklch(0.700_0.165_155)]/12 text-[oklch(0.700_0.165_155)]',
  logout: 'bg-canvas text-foreground-subtle',
  create_ticket: 'bg-primary/12 text-primary',
  update_ticket_status: 'bg-[oklch(0.795_0.155_80)]/12 text-[oklch(0.795_0.155_80)]',
  close_ticket: 'bg-canvas text-foreground-muted',
  assign_contract: 'bg-[oklch(0.680_0.180_310)]/12 text-[oklch(0.680_0.180_310)]',
  update_time_spent: 'bg-[oklch(0.795_0.155_80)]/12 text-[oklch(0.795_0.155_80)]',
  create_comment: 'bg-[oklch(0.700_0.165_230)]/12 text-[oklch(0.700_0.165_230)]',
  upload_attachment: 'bg-primary/12 text-primary',
  delete_attachment: 'bg-destructive/12 text-destructive',
  create_org: 'bg-primary/12 text-primary',
  update_org: 'bg-primary/12 text-primary',
  create_contract: 'bg-[oklch(0.700_0.165_155)]/12 text-[oklch(0.700_0.165_155)]',
  update_contract: 'bg-[oklch(0.795_0.155_80)]/12 text-[oklch(0.795_0.155_80)]',
  terminate_contract: 'bg-destructive/12 text-destructive',
  create_magic_link: 'bg-[oklch(0.680_0.180_310)]/12 text-[oklch(0.680_0.180_310)]',
  revoke_magic_link: 'bg-destructive/12 text-destructive',
  upload_document: 'bg-primary/12 text-primary',
  delete_document: 'bg-destructive/12 text-destructive',
  sync_qonto: 'bg-[oklch(0.700_0.165_230)]/12 text-[oklch(0.700_0.165_230)]',
};

function hasChanges(changes: unknown): changes is Record<string, unknown> {
  return typeof changes === 'object' && changes !== null && Object.keys(changes).length > 0;
}

export default async function AuditLogsPage() {
  const t = await getTranslations('admin');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const logs = await db.query.audit_logs.findMany({
    orderBy: [desc(audit_logs.created_at)],
    limit: 500,
    with: {
      organization: true,
      actor: true,
    },
  });

  const logsByDate: Record<string, typeof logs> = {};
  for (const log of logs) {
    const dateKey = new Date(log.created_at).toLocaleDateString(dateLocale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!logsByDate[dateKey]) {
      logsByDate[dateKey] = [];
    }
    logsByDate[dateKey].push(log);
  }

  // Stats for top cards
  const totalActions = logs.length;
  const uniqueActors = new Set(logs.map((l) => l.actor_id)).size;
  const todayKey = new Date().toLocaleDateString(dateLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const todayCount = logsByDate[todayKey]?.length ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.205 264) 100%, white 12%), oklch(0.625 0.205 264))',
            borderColor: 'color-mix(in oklch, oklch(0.625 0.205 264) 50%, transparent)',
            boxShadow:
              '0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px oklch(0.625 0.205 264 / 0.45)',
          }}
        >
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
            {t('auditTitle')}
          </h1>
          <p className="text-[15px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
            {t('auditSubtitle')}
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: t('auditKpiTotalActions'),
            value: totalActions,
            sub: t('auditKpiTotalActionsSub'),
            icon: Activity,
            tint: 'oklch(0.625 0.205 264)',
          },
          {
            label: t('auditKpiToday'),
            value: todayCount,
            sub: t('auditKpiTodaySub'),
            icon: TrendingUp,
            tint: 'oklch(0.700 0.165 155)',
          },
          {
            label: t('auditKpiActors'),
            value: uniqueActors,
            sub: t('auditKpiActorsSub'),
            icon: Building2,
            tint: 'oklch(0.680 0.180 310)',
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <SpotlightCard
              key={stat.label}
              tintVar={stat.tint}
              className="glow-border group relative overflow-hidden rounded-xl bg-elevated border border-border min-h-[112px]"
            >
              <div
                aria-hidden
                className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-40"
                style={{ background: `radial-gradient(circle, ${stat.tint} 0%, transparent 65%)` }}
              />
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, color-mix(in oklch, ${stat.tint} 35%, transparent), transparent)`,
                }}
              />
              <div className="relative p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] truncate" style={{ color: 'var(--foreground-subtle)' }}>
                    {stat.label}
                  </p>
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: `color-mix(in oklch, ${stat.tint} 14%, transparent)`,
                      borderColor: `color-mix(in oklch, ${stat.tint} 28%, transparent)`,
                      boxShadow: `0 0 16px -4px color-mix(in oklch, ${stat.tint} 55%, transparent)`,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: stat.tint }} strokeWidth={2.25} />
                  </div>
                </div>
                <p className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums leading-none">
                  {stat.value}
                </p>
                <p className="text-[13px] mt-1.5 truncate" style={{ color: 'var(--foreground-subtle)' }}>
                  {stat.sub}
                </p>
              </div>
            </SpotlightCard>
          );
        })}
      </div>

      {/* Audit log timeline */}
      {Object.keys(logsByDate).length === 0 ? (
        <SpotlightCard className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border">
          <div className="text-center py-16 px-6">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
              <div className="relative w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center">
                <Shield className="w-7 h-7" style={{ color: 'var(--foreground-subtle)' }} strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-[15px] font-semibold">{t('auditEmpty')}</h3>
            <p className="text-[15px] mt-1.5 max-w-sm mx-auto" style={{ color: 'var(--foreground-muted)' }}>
              {t('auditEmptyHint')}
            </p>
          </div>
        </SpotlightCard>
      ) : (
        <div className="space-y-6">
          {Object.entries(logsByDate).map(([date, dateLogs]) => (
            <SpotlightCard key={date} className="relative overflow-hidden rounded-xl bg-elevated border border-border">
              {/* Date header */}
              <div className="relative flex items-center gap-3 px-5 py-3.5 border-b border-border">
                <div className="w-7 h-7 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                </div>
                <h2 className="text-[15px] font-semibold capitalize">{date}</h2>
                <Badge
                  variant="secondary"
                  className="font-normal text-[12px] h-5 px-1.5 bg-canvas border-border"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  {t('auditActionsCountLabel', { count: dateLogs.length })}
                </Badge>
                <div className="flex-1" />
              </div>

              {/* Timeline */}
              <div className="relative p-3 space-y-1 animate-in-stagger">
                {dateLogs.map((log) => {
                  const ActionIcon = ACTION_ICONS[log.action] || ClipboardList;
                  const iconColor = ACTION_COLORS[log.action] || 'bg-canvas text-foreground-subtle';

                  return (
                    <div
                      key={log.id}
                      className="list-item-premium flex items-start gap-3 p-3 border border-border rounded-md group"
                    >
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ring-1 ring-border-strong ${iconColor}`}>
                        <ActionIcon className="w-3.5 h-3.5" strokeWidth={2.25} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-medium text-foreground">
                            {ACTION_LABEL_KEYS[log.action] ? t(ACTION_LABEL_KEYS[log.action]) : log.action}
                          </span>
                          <span className="text-[13px]" style={{ color: 'var(--foreground-subtle)' }}>
                            {t('auditByActor')}{' '}
                            <span className="font-medium text-foreground/80">
                              {log.actor?.name ?? log.actor?.email ?? log.actor_id.slice(0, 8)}
                            </span>
                          </span>
                          {log.organization && (
                            <Badge
                              variant="outline"
                              className="text-[12px] py-0 h-5 px-1.5 bg-canvas border-border"
                              style={{ color: 'var(--foreground-muted)' }}
                            >
                              {log.organization.name}
                            </Badge>
                          )}
                        </div>

                        <div className="text-[13px] mt-1 flex items-center gap-3 flex-wrap" style={{ color: 'var(--foreground-subtle)' }}>
                          <span className="font-mono">
                            {log.entity_type} · {log.entity_id.slice(0, 8)}
                          </span>
                          {log.ip_address && (
                            <span className="font-mono">IP {log.ip_address}</span>
                          )}
                        </div>

                        {hasChanges(log.changes) && (
                          <details className="mt-2 text-[13px] group">
                            <summary
                              className="cursor-pointer font-medium hover:text-foreground transition-colors select-none"
                              style={{ color: 'var(--foreground-muted)' }}
                            >
                              <span className="inline-flex items-center gap-1">
                                <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                                {t('auditChangesDetails')}
                              </span>
                            </summary>
                            <pre className="mt-2 bg-canvas border border-border p-3 rounded-md text-[12px] overflow-x-auto font-mono leading-relaxed">
                              {JSON.stringify(log.changes, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>

                      {/* Time */}
                      <span className="text-[13px] font-mono whitespace-nowrap shrink-0 tabular-nums" style={{ color: 'var(--foreground-subtle)' }}>
                        {new Date(log.created_at).toLocaleTimeString(dateLocale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </SpotlightCard>
          ))}
        </div>
      )}
    </div>
  );
}
