import { OrganizationForm } from '@/components/organizations/organization-form';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function NewOrganizationPage() {
  const t = await getTranslations('admin');
  return (
    <div className="max-w-2xl mx-auto space-y-8 p-6 lg:p-8 animate-in">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('backToOrgs')}
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[oklch(0.680_0.180_310)]/12 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[oklch(0.680_0.180_310)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('createOrg')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('createOrgSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <Card className="border-0 shadow-premium-sm">
        <CardContent className="pt-6">
          <OrganizationForm />
        </CardContent>
      </Card>
    </div>
  );
}
