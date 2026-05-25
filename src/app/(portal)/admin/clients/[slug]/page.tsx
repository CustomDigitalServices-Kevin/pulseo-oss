import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { getOrganization } from '@/actions/organizations';
import { listOrgResponsibles } from '@/actions/org-responsibles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResponsiblesManager } from '@/components/admin/responsibles-manager';
import { DeleteResourceDialog } from '@/components/admin/delete-resource-dialog';
import { deleteOrganization } from '@/actions/organizations';
import { ArrowLeft, Building2, ExternalLink, Mail, Image as ImageIcon } from 'lucide-react';
import {
  OrgLogo,
  dbSizeToInternal,
  type LogoBackground,
  type LogoShape,
} from '@/components/organizations/org-logo';
import { LogoUploader } from '@/components/organizations/logo-uploader';

/**
 * Admin detail page for an organization — super-admin only.
 * Currently exposes management of client-side responsables (multi-recipient
 * contacts notified on every ticket event and on invite sign-ups).
 */
export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const t = await getTranslations('admin');
  const { slug } = await params;

  const orgResult = await getOrganization(slug);
  if (!orgResult.success || !orgResult.data) {
    notFound();
  }
  const org = orgResult.data;

  const listResult = await listOrgResponsibles(org.id);
  const responsibles = listResult.success ? listResult.data : [];

  return (
    <div className="p-6 lg:p-8 xl:p-10 space-y-6 animate-in w-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link
            href="/admin/clients"
            className="inline-flex items-center gap-1.5 text-[15px] text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('clientDetailBackAll')}
          </Link>
          <div className="flex items-center gap-4">
            <OrgLogo
              name={org.name}
              logoUrl={org.logo_url ?? null}
              background={(org.logo_background ?? 'auto') as LogoBackground}
              shape={(org.logo_shape ?? 'square') as LogoShape}
              size={dbSizeToInternal(org.logo_size)}
              fallbackColor={org.color_primary ?? '#2563EB'}
              className="shadow-premium-sm"
            />
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold tracking-tight leading-tight truncate">{org.name}</h1>
              <p className="text-[15px] text-foreground-subtle font-mono mt-0.5">{org.slug}</p>
            </div>
          </div>
        </div>

        <Link href={`/clients/${org.slug}`}>
          <Button variant="outline" size="sm" className="gap-1.5 h-9">
            <ExternalLink className="w-4 h-4" />
            {t('clientDetailViewClientSpace')}
          </Button>
        </Link>
      </div>

      <Card className="border-border bg-elevated shadow-premium-sm">
        <CardHeader className="flex flex-row items-center gap-2.5 pb-3 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-[15px] font-semibold">Logo client</CardTitle>
            <p className="text-[14px] text-foreground-subtle mt-0.5">
              Téléversez le logo affiché dans le portail client. Le mode automatique détecte la teinte de fond pour les bitmaps.
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <LogoUploader
            organizationId={org.id}
            initialLogoUrl={org.logo_url ?? null}
            initialLogoBackground={(org.logo_background ?? 'auto') as LogoBackground}
            initialLogoShape={(org.logo_shape ?? 'square') as LogoShape}
            initialLogoSize={(org.logo_size ?? 'md') as 'sm' | 'md' | 'lg'}
            organizationName={org.name}
            fallbackColor={org.color_primary ?? '#2563EB'}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

      <Card className="border-border bg-elevated shadow-premium-sm xl:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-[15px] font-semibold">{t('clientDetailResponsiblesTitle')}</CardTitle>
              <p className="text-[14px] text-foreground-subtle mt-0.5">
                {t('clientDetailResponsiblesSubtitle')}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-[13px] h-6 px-2 bg-elevated border-border">
            {t('clientDetailResponsiblesCount', { count: responsibles.length })}
          </Badge>
        </CardHeader>
        <CardContent className="pt-5">
          <ResponsiblesManager
            organizationId={org.id}
            initial={responsibles.map((r) => ({
              id: r.id,
              email: r.email,
              name: r.name,
              created_at: r.created_at.toISOString(),
            }))}
          />
        </CardContent>
      </Card>

      {org.responsible_email ? (
        <Card className="border-border bg-elevated shadow-premium-sm xl:col-span-1">
          <CardHeader className="flex flex-row items-center gap-2.5 pb-3 border-b border-border">
            <div className="w-8 h-8 rounded-md bg-[oklch(0.795_0.155_80)]/12 ring-1 ring-[oklch(0.795_0.155_80)]/25 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[oklch(0.795_0.155_80)]" />
            </div>
            <CardTitle className="text-[15px] font-semibold">{t('clientDetailLegacyTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 text-[15px] text-foreground-muted">
            <p className="mb-2">
              <span className="font-medium text-foreground">
                {org.responsible_name ?? org.responsible_email}
              </span>
              {' '}
              <span className="font-mono text-[14px] block mt-0.5">{org.responsible_email}</span>
            </p>
            <p className="text-[14px] text-foreground-subtle">
              {t('clientDetailLegacyHint')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border bg-elevated/60 shadow-premium-sm xl:col-span-1 border-dashed">
          <CardHeader className="flex flex-row items-center gap-2.5 pb-3 border-b border-border">
            <div className="w-8 h-8 rounded-md bg-foreground/5 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-foreground-subtle" />
            </div>
            <CardTitle className="text-[15px] font-semibold text-foreground-muted">{t('clientDetailNoLegacyTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 text-[14px] text-foreground-subtle">
            {t('clientDetailNoLegacyHint')}
          </CardContent>
        </Card>
      )}
      </div>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3 border-b border-destructive/20">
          <CardTitle className="text-[15px] font-semibold text-destructive">
            {t('dangerZone')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="text-[15px] text-foreground-muted max-w-[640px] leading-relaxed">
            {t('clientDetailDangerHint')}
          </div>
          <DeleteResourceDialog
            resourceKind="organisation"
            resourceGender="f"
            resourceName={org.name}
            warnings={[
              t('clientDetailDangerWarn1'),
              t('clientDetailDangerWarn2'),
              t('clientDetailDangerWarn3'),
              t('clientDetailDangerWarn4'),
              t('clientDetailDangerWarn5'),
              t('clientDetailDangerWarn6'),
            ]}
            redirectTo="/admin/clients"
            onDelete={async () => {
              'use server';
              try {
                const result = await deleteOrganization(org.id);
                return { ok: result.success === true };
              } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
