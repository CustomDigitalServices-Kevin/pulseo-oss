import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { Card, CardContent } from '@/components/ui/card';
import { GroupCreateForm } from '@/components/admin/group-create-form';
import { ArrowLeft, Layers } from 'lucide-react';

export default async function NewGroupPage() {
  await requireAdmin();
  const t = await getTranslations('admin');

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6 lg:p-8 animate-in">
      <div>
        <Link
          href="/admin/groups"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('backToGroups')}
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[oklch(0.68_0.18_155)]/12 flex items-center justify-center">
            <Layers className="w-5 h-5 text-[oklch(0.68_0.18_155)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('createGroup')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('createGroupSubtitle')}
            </p>
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-premium-sm">
        <CardContent className="pt-6">
          <GroupCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
