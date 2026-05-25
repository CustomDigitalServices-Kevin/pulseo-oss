import { getOrganization } from '@/actions/organizations';
import { db } from '@/lib/db';
import { contracts } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { getMemberRole, hasMinRole } from '@/lib/auth/require-role';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExportButton } from '@/components/common/export-button';
import { ContractStatusLabels, type ContractStatusType } from '@/types';
import {
  Plus,
  ArrowRight,
  ScrollText,
  Calendar,
  AlertCircle,
} from 'lucide-react';

const statusStyles: Record<string, string> = {
  active: 'bg-[oklch(0.700_0.165_155)]/12 text-[oklch(0.700_0.165_155)] border-[oklch(0.700_0.165_155)]/30',
  expired: 'bg-foreground-subtle/10 text-foreground-subtle border-foreground-subtle/25',
  terminated: 'bg-destructive/12 text-destructive border-destructive/30',
};

function getProgressColor(percent: number, isOver: boolean): string {
  if (isOver) return 'bg-destructive';
  if (percent > 80) return 'bg-[oklch(0.795_0.155_80)]';
  if (percent > 50) return 'bg-[oklch(0.700_0.165_230)]';
  return 'bg-[oklch(0.700_0.165_155)]';
}

export default async function ContractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const status = search.status as string | undefined;
  const t = await getTranslations('clients');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';

  const session = await requireSession();
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

  // Viewers n'ont pas acces aux contrats — redirect vers tickets
  const memberInfo = await getMemberRole(session.user.id, org.id);
  if (!memberInfo || !hasMinRole(memberInfo.role, 'gestionnaire')) {
    redirect(`/clients/${slug}/tickets`);
  }

  const whereConditions = [eq(contracts.organization_id, org.id)];
  if (status && status !== 'all') {
    whereConditions.push(eq(contracts.status, status));
  }

  const contractList = await db
    .select()
    .from(contracts)
    .where(and(...whereConditions))
    .orderBy(desc(contracts.created_at));

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{t('contracts')}</h1>
          <p className="text-[15px] text-foreground-muted mt-1">
            {t('contractsCount', { count: contractList.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href={`/api/export/contracts?org_id=${org.id}`} label={t('exportExcel')} />
          <Link href={`/clients/${slug}/contracts/new`}>
            <Button size="sm" className="gap-1.5 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" />
              {t('contractsNewCta')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Contract list */}
      <Card className="border border-border bg-elevated shadow-premium-sm">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-[15px] font-semibold flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
              <ScrollText className="w-3.5 h-3.5 text-primary" />
            </div>
            <span>{t('contractsAll')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {contractList.length === 0 ? (
            <div className="text-center py-12">
              <ScrollText className="w-10 h-10 mx-auto text-foreground-subtle/40" />
              <p className="text-[15px] text-foreground-muted mt-3">{t('contractsEmpty')}</p>
              <Link href={`/clients/${slug}/contracts/new`}>
                <Button size="sm" className="mt-4 h-8 text-xs">{t('contractsCreateFirst')}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2 animate-in-stagger">
              {contractList.map((contract) => {
                const quotaH = parseFloat(contract.quota_hours);
                const consumedH = parseFloat(contract.consumed_hours);
                const percent = quotaH > 0 ? Math.min((consumedH / quotaH) * 100, 100) : 0;
                const isOver = consumedH > quotaH;
                const progressColor = getProgressColor(percent, isOver);

                return (
                  <Link
                    key={contract.id}
                    href={`/clients/${slug}/contracts/${contract.id}`}
                    className="list-item-premium block p-4 border border-border rounded-md group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Name + status */}
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <h3 className="font-medium text-[15px] truncate">{contract.name}</h3>
                          <Badge
                            variant="outline"
                            className={`h-5 text-[12px] px-1.5 font-medium ${statusStyles[contract.status]}`}
                          >
                            {ContractStatusLabels[contract.status as ContractStatusType] || contract.status}
                          </Badge>
                        </div>

                        {/* Description */}
                        {contract.description && (
                          <p className="text-[13px] text-foreground-subtle mb-2 line-clamp-1">
                            {contract.description}
                          </p>
                        )}

                        {/* Meta */}
                        <div className="flex items-center gap-4 text-[13px] text-foreground-subtle">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            <span className="tabular-nums">
                              {new Date(contract.start_date).toLocaleDateString(dateLocale, {
                                day: 'numeric',
                                month: 'short',
                              })}
                              {' → '}
                              {new Date(contract.end_date).toLocaleDateString(dateLocale, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums">{contract.rate_per_hour} {t('contractHoursPerHour')}</span>
                        </div>
                      </div>

                      {/* Quota gauge */}
                      <div className="text-right min-w-[140px] shrink-0">
                        <p className={`text-[17px] font-semibold tracking-tight tabular-nums ${isOver ? 'text-destructive' : 'text-foreground'}`}>
                          {consumedH.toFixed(1)}<span className="text-[14px] font-normal text-foreground-subtle"> / {quotaH.toFixed(0)} h</span>
                        </p>
                        <div className="w-full bg-canvas border border-border rounded-full h-1.5 mt-2 progress-bar overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          />
                        </div>
                        <p className="text-[12px] text-foreground-subtle mt-1.5 tabular-nums">
                          {t('contractUsedPercent', { percent: percent.toFixed(0) })}
                        </p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="w-3.5 h-3.5 text-foreground-subtle opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
