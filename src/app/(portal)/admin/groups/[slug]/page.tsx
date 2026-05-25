import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  organization_groups,
  organizations,
  organization_group_managers,
  users,
} from '@/lib/db/schema';
import { eq, isNull, asc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GroupEditForm } from '@/components/admin/group-edit-form';
import { DeleteResourceDialog } from '@/components/admin/delete-resource-dialog';
import { deleteGroup } from '@/actions/groups';
import { ArrowLeft, Layers } from 'lucide-react';

export default async function AdminGroupDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const t = await getTranslations('admin');
  const { slug } = await params;

  const [group] = await db
    .select()
    .from(organization_groups)
    .where(eq(organization_groups.slug, slug))
    .limit(1);
  if (!group) notFound();

  const [attachedOrgs, unattachedOrgs, managerRows] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.group_id, group.id))
      .orderBy(asc(organizations.name)),
    db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(isNull(organizations.group_id))
      .orderBy(asc(organizations.name)),
    db
      .select({
        user_id: organization_group_managers.user_id,
        email: users.email,
        name: users.name,
      })
      .from(organization_group_managers)
      .innerJoin(users, eq(users.id, organization_group_managers.user_id))
      .where(eq(organization_group_managers.group_id, group.id))
      .orderBy(asc(users.email)),
  ]);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in max-w-4xl">
      <div>
        <Link
          href="/admin/groups"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('groupDetailBackAll')}
        </Link>
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-semibold border overflow-hidden"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in oklch, oklch(0.68 0.18 155) 100%, white 12%), oklch(0.68 0.18 155))',
              borderColor: 'color-mix(in oklch, oklch(0.68 0.18 155) 50%, transparent)',
            }}
          >
            {group.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.logo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Layers className="w-5 h-5" />
            )}
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight leading-tight">
              {group.name}
            </h1>
            <p className="text-[13px] text-foreground-subtle font-mono">{group.slug}</p>
          </div>
        </div>
      </div>

      <Card className="border-border bg-elevated shadow-premium-sm">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-[15px] font-semibold">{t('groupDetailManagement')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <GroupEditForm
            group={{
              id: group.id,
              name: group.name,
              slug: group.slug,
              logo_url: group.logo_url,
            }}
            attachedOrgs={attachedOrgs}
            unattachedOrgs={unattachedOrgs}
            managers={managerRows}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3 border-b border-destructive/20">
          <CardTitle className="text-[15px] font-semibold text-destructive">
            {t('dangerZone')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 flex items-start justify-between gap-4">
          <div className="text-[14px] text-foreground-muted max-w-[420px]">
            {t('groupDetailDangerHint', { orgs: attachedOrgs.length, mgrs: managerRows.length })}
          </div>
          <DeleteResourceDialog
            resourceKind="groupe"
            resourceGender="m"
            resourceName={group.name}
            warnings={[
              t('groupDetailWarnOrgs', { count: attachedOrgs.length }),
              t('groupDetailWarnMgrs', { count: managerRows.length }),
              t('groupDetailWarnIrreversible'),
            ]}
            redirectTo="/admin/groups"
            onDelete={async () => {
              'use server';
              try {
                const result = await deleteGroup({ group_id: group.id });
                return { ok: result.deleted };
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
