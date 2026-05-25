import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, teams } from '@/lib/db/schema';
import { requireSession, isUserAdmin } from '@/lib/auth/session';
import { canAccessOrg } from '@/lib/auth/permissions';
import { getEffectiveRole } from '@/lib/auth/effective-role';
import { listOrgMembers } from '@/lib/members/query';
import { MembersView } from '@/components/members/members-view';
import {
  getMemberDetail,
  addMemberDirect,
  removeMemberDirect,
  getNonMemberRowDetail,
  updateMemberInfoAction,
  resendInviteAction,
  cancelInviteAction,
  updateResponsibleAction,
  removeResponsibleAction,
  updateOrgLeadAction,
  convertExternalToInviteAction,
} from '@/actions/member-view';
import type { Role } from '@/lib/auth/effective-role';
import { Users, Download } from 'lucide-react';

async function fetchActorContext(userId: string, orgId: string, isSuperadmin: boolean) {
  const [role, teamsList] = await Promise.all([
    getEffectiveRole(userId, orgId),
    isSuperadmin
      ? db.select({ id: teams.id, name: teams.name }).from(teams)
      : Promise.resolve([]),
  ]);
  return { role: role as Role | null, teamsList };
}

export default async function OrgMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireSession();

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) notFound();

  const isSuperadmin = await isUserAdmin(session.user.id);

  if (!isSuperadmin && !(await canAccessOrg(session.user.id, org.id))) {
    notFound();
  }

  const { role, teamsList } = await fetchActorContext(
    session.user.id,
    org.id,
    isSuperadmin,
  );

  const members = await listOrgMembers(
    org.id,
    { userId: session.user.id, isSuperadmin },
  );

  const orgId = org.id;

  // Counters affichés dans le header — uniquement les rangées "active" (les
  // invites et contacts externes ne sont pas comptés comme "membres").
  const activeMembersCount = members.filter((m) => m.source_kind === 'member').length;

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
        <div className="flex-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
            Membres
          </h1>
          <p className="text-[15px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
            {org.name} — {activeMembersCount} membre{activeMembersCount > 1 ? 's' : ''}
            {members.length !== activeMembersCount && (
              <span> · {members.length - activeMembersCount} en attente / externes</span>
            )}
          </p>
        </div>
        {(isSuperadmin || (role && ['gestionnaire', 'admin'].includes(role))) && (
          <a
            href={`/api/export/members?org_id=${org.id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-elevated text-[14px] hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
        )}
      </div>

      <MembersView
        members={members}
        scope={{ type: 'org', id: org.id }}
        actor={{ role, isSuperadmin }}
        organizationId={orgId}
        teams={teamsList}
        loadDetail={async (memberId) => {
          'use server';
          return getMemberDetail({ userId: memberId, organizationId: orgId });
        }}
        loadNonMemberDetail={async (rowId) => {
          'use server';
          return getNonMemberRowDetail({ rowId, organizationId: orgId });
        }}
        submitAddDirect={async ({ email, role: r }) => {
          'use server';
          return addMemberDirect({ organizationId: orgId, email, role: r });
        }}
        onRemove={async (rowId) => {
          'use server';
          if (rowId.startsWith('invite:')) {
            return cancelInviteAction({
              organizationId: orgId,
              inviteId: rowId.slice('invite:'.length),
            });
          }
          if (rowId.startsWith('responsible:')) {
            return removeResponsibleAction({
              responsibleId: rowId.slice('responsible:'.length),
            });
          }
          if (rowId.startsWith('org_lead:')) {
            return updateOrgLeadAction({
              organizationId: orgId,
              email: null,
              name: null,
            });
          }
          return removeMemberDirect({ organizationId: orgId, userId: rowId });
        }}
        onUpdateMemberInfo={async (args) => {
          'use server';
          return updateMemberInfoAction({
            organizationId: orgId,
            userId: args.userId,
            name: args.name,
            first_name: args.first_name,
            last_name: args.last_name,
            job_title: args.job_title,
          });
        }}
        onResendInvite={async (inviteId) => {
          'use server';
          return resendInviteAction({ organizationId: orgId, inviteId });
        }}
        onCancelInvite={async (inviteId) => {
          'use server';
          return cancelInviteAction({ organizationId: orgId, inviteId });
        }}
        onUpdateResponsible={async (args) => {
          'use server';
          return updateResponsibleAction(args);
        }}
        onRemoveResponsible={async (responsibleId) => {
          'use server';
          return removeResponsibleAction({ responsibleId });
        }}
        onUpdateOrgLead={async (args) => {
          'use server';
          return updateOrgLeadAction(args);
        }}
        onConvertExternal={async (args) => {
          'use server';
          return convertExternalToInviteAction(args);
        }}
      />
    </div>
  );
}
