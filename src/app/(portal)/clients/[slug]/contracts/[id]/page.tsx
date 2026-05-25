import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth/session';
import { getMemberRole, hasMinRole } from '@/lib/auth/require-role';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ContractStatusLabels, type ContractStatusType } from '@/types';
import { ContractActions } from '@/components/contracts/contract-actions';
import { QuotaGauge } from '@/components/contracts/quota-gauge';

const statusColors: Record<string, string> = {
  active: 'bg-[oklch(0.700_0.165_155)]/15 text-[oklch(0.700_0.165_155)]',
  expired: 'bg-elevated text-foreground',
  terminated: 'bg-destructive/15 text-destructive',
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await requireSession();
  const t = await getTranslations('clients');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';

  const org = await db.query.organizations.findFirst({
    where: (o, { eq }) => eq(o.slug, slug),
    columns: { id: true },
  });

  if (!org) {
    return <div className="p-6">{t('orgNotFound')}</div>;
  }

  // Viewers n'ont pas acces aux contrats
  const memberInfo = await getMemberRole(session.user.id, org.id);
  if (!memberInfo || !hasMinRole(memberInfo.role, 'gestionnaire')) {
    redirect(`/clients/${slug}/tickets`);
  }

  const contract = await db.query.contracts.findFirst({
    where: (c, { and, eq }) => and(eq(c.id, id), eq(c.organization_id, org.id)),
    with: {
      tickets: {
        orderBy: (t, { desc }) => [desc(t.created_at)],
        limit: 10,
      },
    },
  });

  if (!contract) {
    return <div className="p-6">{t('contractNotFound')}</div>;
  }

  const quotaH = parseFloat(contract.quota_hours);
  const consumedH = parseFloat(contract.consumed_hours);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">{contract.name}</h1>
          <Badge className={statusColors[contract.status]}>
            {ContractStatusLabels[contract.status as ContractStatusType] || contract.status}
          </Badge>
        </div>
        <Link href={`/clients/${slug}/contracts`}>
          <Button variant="outline">{t('contractBackDetail')}</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <QuotaGauge consumed={consumedH} quota={quotaH} />

          {contract.description && (
            <Card>
              <CardHeader>
                <CardTitle>{t('contractDescriptionTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{contract.description}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('contractRelatedTickets', { count: contract.tickets.length })}</CardTitle>
            </CardHeader>
            <CardContent>
              {contract.tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('contractNoLinkedTickets')}</p>
              ) : (
                <div className="space-y-2">
                  {contract.tickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/clients/${slug}/tickets/${ticket.id}`}
                      className="block p-3 border border-border rounded hover:bg-accent transition text-sm"
                    >
                      <div className="flex justify-between">
                        <span>
                          <strong>#{ticket.number}</strong> {ticket.title}
                        </span>
                        <span className="text-muted-foreground">
                          {((ticket.time_spent_minutes || 0) / 60).toFixed(1)}h
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('contractInfoTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t('contractQuotaLabel')}</p>
                <p className="font-medium">{quotaH.toFixed(0)} {t('contractHours')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('contractConsumedLabel')}</p>
                <p className="font-medium">{consumedH.toFixed(1)} {t('contractHours')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('contractRemainingLabel')}</p>
                <p className="font-medium">{Math.max(0, quotaH - consumedH).toFixed(1)} {t('contractHours')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('contractHourlyRateLabel')}</p>
                <p className="font-medium">{contract.rate_per_hour} {t('contractHoursPerHour')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('contractStartDateLabel')}</p>
                <p className="font-medium">
                  {new Date(contract.start_date).toLocaleDateString(dateLocale)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('contractEndDateLabel')}</p>
                <p className="font-medium">
                  {new Date(contract.end_date).toLocaleDateString(dateLocale)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('contractCreatedAtLabel')}</p>
                <p className="font-medium">
                  {new Date(contract.created_at).toLocaleDateString(dateLocale)}
                </p>
              </div>
            </CardContent>
          </Card>

          <ContractActions contract={contract} />
        </div>
      </div>
    </div>
  );
}
