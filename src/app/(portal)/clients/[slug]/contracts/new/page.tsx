import { ContractForm } from '@/components/contracts/contract-form';
import { Card, CardContent } from '@/components/ui/card';
import { getOrganization } from '@/actions/organizations';
import { requireSession } from '@/lib/auth/session';
import { getMemberRole, hasMinRole } from '@/lib/auth/require-role';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, ScrollText, AlertCircle } from 'lucide-react';

export default async function NewContractPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  // Viewers n'ont pas acces aux contrats
  const memberInfo = await getMemberRole(session.user.id, orgResult.data.id);
  if (!memberInfo || !hasMinRole(memberInfo.role, 'gestionnaire')) {
    redirect(`/clients/${slug}/tickets`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-6 lg:p-8 animate-in">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/clients/${slug}/contracts`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('contractBackAll')}
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[oklch(0.700_0.165_155)]/12 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-[oklch(0.700_0.165_155)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('newContractTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('newContractSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <Card className="border-0 shadow-premium-sm">
        <CardContent className="pt-6">
          <ContractForm slug={slug} orgId={orgResult.data.id} />
        </CardContent>
      </Card>
    </div>
  );
}
