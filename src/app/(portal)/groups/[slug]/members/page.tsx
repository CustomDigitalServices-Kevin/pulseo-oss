import { notFound } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { getTranslations, getLocale } from 'next-intl/server';
import { db } from '@/lib/db';
import {
  organization_groups,
  organization_group_managers,
  users as usersTable,
} from '@/lib/db/schema';
import { requireSession, isUserAdmin } from '@/lib/auth/session';
import { canAccessGroup } from '@/lib/auth/permissions';
import { Users } from 'lucide-react';
import Link from 'next/link';

export default async function GroupMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireSession();
  const isSuperadmin = await isUserAdmin(session.user.id);

  const [group] = await db
    .select({
      id: organization_groups.id,
      name: organization_groups.name,
      slug: organization_groups.slug,
    })
    .from(organization_groups)
    .where(eq(organization_groups.slug, slug))
    .limit(1);
  if (!group) notFound();

  if (!isSuperadmin && !(await canAccessGroup(session.user.id, group.id))) {
    notFound();
  }

  const managerRows = await db
    .select({
      id: organization_group_managers.id,
      user_id: organization_group_managers.user_id,
      created_at: organization_group_managers.created_at,
    })
    .from(organization_group_managers)
    .where(eq(organization_group_managers.group_id, group.id));

  const managerUserIds = managerRows.map((r) => r.user_id);
  const managerUsers =
    managerUserIds.length > 0
      ? await db
          .select({
            id: usersTable.id,
            email: usersTable.email,
            name: usersTable.name,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, managerUserIds))
      : [];
  const userById = new Map(managerUsers.map((u) => [u.id, u]));

  const t = await getTranslations('members');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.130 155) 100%, white 12%), oklch(0.625 0.130 155))',
            borderColor: 'color-mix(in oklch, oklch(0.625 0.130 155) 50%, transparent)',
          }}
        >
          <Users className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
            {t('groupTitleWithName', { name: group.name })}
          </h1>
          <p className="text-[15px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
            {t('groupSubtitle', { count: managerRows.length })}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-elevated p-6">
        {managerRows.length === 0 ? (
          <p className="text-[15px] text-foreground-muted">
            {t('groupEmptyManagers')}{' '}
            <Link
              href={`/admin/groups/${group.slug}/edit`}
              className="text-primary hover:underline"
            >
              {t('groupEmptyAddFromAdmin')}
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {managerRows.map((r) => {
              const user = userById.get(r.user_id);
              const dateStr = new Date(r.created_at).toLocaleDateString(dateLocale, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      aria-hidden="true"
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold border text-white"
                      style={{
                        background:
                          'linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.130 155) 100%, white 12%), oklch(0.625 0.130 155))',
                        borderColor: 'color-mix(in oklch, oklch(0.625 0.130 155) 50%, transparent)',
                      }}
                    >
                      {(user?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[15px] font-medium">
                        {user?.name ?? user?.email ?? r.user_id}
                      </div>
                      {user?.name && (
                        <div className="text-[13px] text-foreground-muted">{user.email}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-[13px] text-foreground-subtle tabular-nums">
                    {t('groupMemberSince', { date: dateStr })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
