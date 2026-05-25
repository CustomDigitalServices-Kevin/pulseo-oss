import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  teams,
  team_members,
  team_organization_grants,
  organizations,
  users,
} from '@/lib/db/schema';
import { eq, asc, notInArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamEditForm } from '@/components/admin/team-edit-form';
import { DeleteResourceDialog } from '@/components/admin/delete-resource-dialog';
import { deleteTeam } from '@/actions/teams';
import { ArrowLeft, Users2 } from 'lucide-react';

type Role = 'viewer' | 'gestionnaire' | 'admin';

export default async function AdminTeamDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const t = await getTranslations('admin');
  const { slug } = await params;

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1);
  if (!team) notFound();

  const [memberRows, grantRowsRaw] = await Promise.all([
    db
      .select({
        user_id: team_members.user_id,
        email: users.email,
        name: users.name,
      })
      .from(team_members)
      .innerJoin(users, eq(users.id, team_members.user_id))
      .where(eq(team_members.team_id, team.id))
      .orderBy(asc(users.email)),
    db
      .select({
        organization_id: team_organization_grants.organization_id,
        role: team_organization_grants.role,
        organization_name: organizations.name,
        organization_slug: organizations.slug,
      })
      .from(team_organization_grants)
      .innerJoin(
        organizations,
        eq(organizations.id, team_organization_grants.organization_id),
      )
      .where(eq(team_organization_grants.team_id, team.id))
      .orderBy(asc(organizations.name)),
  ]);

  // Normalise role to the union — schema stores it as varchar. Any drift here
  // means a data integrity problem; surface it rather than silently casting.
  const grantRows = grantRowsRaw.map((g) => {
    if (g.role !== 'viewer' && g.role !== 'gestionnaire' && g.role !== 'admin') {
      throw new Error(`Rôle invalide en base : ${g.role}`);
    }
    return { ...g, role: g.role as Role };
  });

  const grantedOrgIds = grantRows.map((g) => g.organization_id);
  const ungrantedOrgs =
    grantedOrgIds.length > 0
      ? await db
          .select({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
          })
          .from(organizations)
          .where(notInArray(organizations.id, grantedOrgIds))
          .orderBy(asc(organizations.name))
      : await db
          .select({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
          })
          .from(organizations)
          .orderBy(asc(organizations.name));

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in max-w-4xl">
      <div>
        <Link
          href="/admin/teams"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('teamDetailBackAll')}
        </Link>
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-semibold border"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in oklch, oklch(0.70 0.17 30) 100%, white 12%), oklch(0.70 0.17 30))',
              borderColor: 'color-mix(in oklch, oklch(0.70 0.17 30) 50%, transparent)',
            }}
          >
            <Users2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight leading-tight">
              {team.name}
            </h1>
            <p className="text-[13px] text-foreground-subtle font-mono">{team.slug}</p>
          </div>
        </div>
      </div>

      <Card className="border-border bg-elevated shadow-premium-sm">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-[15px] font-semibold">{t('teamDetailManagement')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <TeamEditForm
            team={{
              id: team.id,
              name: team.name,
              slug: team.slug,
              description: team.description,
            }}
            members={memberRows}
            grants={grantRows}
            ungrantedOrgs={ungrantedOrgs}
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
            {t('teamDetailDangerHint', { members: memberRows.length, grants: grantRows.length })}
          </div>
          <DeleteResourceDialog
            resourceKind="équipe"
            resourceGender="f"
            resourceName={team.name}
            warnings={[
              t('teamDetailWarnMembers', { count: memberRows.length }),
              t('teamDetailWarnGrants', { count: grantRows.length }),
              t('teamDetailWarnInvalidLinks'),
              t('teamDetailWarnIrreversible'),
            ]}
            redirectTo="/admin/teams"
            onDelete={async () => {
              'use server';
              try {
                const result = await deleteTeam({ team_id: team.id });
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
