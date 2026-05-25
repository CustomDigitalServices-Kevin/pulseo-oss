import Link from 'next/link';
import { z } from 'zod';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users, user_activity_events } from '@/lib/db/schema';
import { desc, inArray, sql } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserSuperadminToggle } from '@/components/admin/user-superadmin-toggle';
import { Users, ShieldCheck, Activity, X } from 'lucide-react';

const filtersSchema = z.object({
  active: z.enum(['7d', '30d']).optional(),
});

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const t = await getTranslations('admin');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const raw = await searchParams;
  const parsed = filtersSchema.safeParse({
    active: typeof raw.active === 'string' ? raw.active : undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  let activeUserIds: Set<string> | null = null;
  if (filters.active) {
    const days = filters.active === '7d' ? 7 : 30;
    const activeRows = await db
      .select({ user_id: user_activity_events.user_id })
      .from(user_activity_events)
      .where(sql`${user_activity_events.created_at} > NOW() - (${days}::int * INTERVAL '1 day')`)
      .groupBy(user_activity_events.user_id);
    activeUserIds = new Set(activeRows.map((r) => r.user_id));
  }

  const allRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      is_superadmin: users.is_superadmin,
      createdAt: users.createdAt,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const rows = activeUserIds
    ? allRows.filter((u) => activeUserIds!.has(u.id))
    : allRows;

  const superadminCount = rows.filter((r) => r.is_superadmin).length;
  void inArray;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
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
          <Users className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
            {t('users')}
          </h1>
          <p className="text-[15px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
            {t('usersCountLabel', {
              count: rows.length,
              superadmin: superadminCount,
              active: filters.active ? t('usersActiveSuffix', { range: filters.active }) : '',
            })}
          </p>
          {filters.active && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-[12px] gap-1">
                <Activity className="w-3 h-3" />
                {t('usersActiveBadge', { range: filters.active })}
              </Badge>
              <Link
                href="/admin/users"
                className="text-[13px] text-foreground-muted hover:text-primary inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                {tCommon('reset')}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/users?active=7d"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[14px] transition-colors"
          style={{
            borderColor:
              filters.active === '7d'
                ? 'color-mix(in oklch, oklch(0.625 0.140 155) 50%, transparent)'
                : 'var(--border)',
            background:
              filters.active === '7d'
                ? 'color-mix(in oklch, oklch(0.625 0.140 155) 14%, transparent)'
                : 'var(--elevated)',
            color:
              filters.active === '7d' ? 'oklch(0.625 0.140 155)' : 'var(--foreground-muted)',
          }}
        >
          <Activity className="w-3.5 h-3.5" />
          {t('usersFilterActive7d')}
        </Link>
        <Link
          href="/admin/users?active=30d"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[14px] transition-colors"
          style={{
            borderColor:
              filters.active === '30d'
                ? 'color-mix(in oklch, oklch(0.625 0.140 155) 50%, transparent)'
                : 'var(--border)',
            background:
              filters.active === '30d'
                ? 'color-mix(in oklch, oklch(0.625 0.140 155) 14%, transparent)'
                : 'var(--elevated)',
            color:
              filters.active === '30d' ? 'oklch(0.625 0.140 155)' : 'var(--foreground-muted)',
          }}
        >
          <Activity className="w-3.5 h-3.5" />
          {t('usersFilterActive30d')}
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">{t('usersTableEmail')}</TableHead>
              <TableHead>{t('usersTableName')}</TableHead>
              <TableHead>{t('usersTableRole')}</TableHead>
              <TableHead>{t('usersTableSignup')}</TableHead>
              <TableHead className="text-right">{t('usersTableActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-foreground-muted text-[15px]"
                >
                  {t('usersEmpty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((u) => {
                const isSelf = u.id === session.user.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-[14px]">{u.email}</TableCell>
                    <TableCell className="text-[15px]">
                      {u.name ?? <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell>
                      {u.is_superadmin ? (
                        <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/20 border border-primary/25">
                          <ShieldCheck className="w-3 h-3" />
                          {t('usersRoleSuperadmin')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-foreground-muted">
                          {t('usersRoleUser')}
                        </Badge>
                      )}
                      {isSelf && (
                        <span className="ml-2 text-[12px] uppercase tracking-wider text-foreground-subtle">
                          {t('usersSelfTag')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[14px] text-foreground-muted tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString(dateLocale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserSuperadminToggle
                        userId={u.id}
                        isSuperadmin={u.is_superadmin}
                        isSelf={isSelf}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
