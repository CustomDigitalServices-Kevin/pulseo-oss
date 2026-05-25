'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  MembersTable,
  type MemberRow,
  type MembersTableScope,
} from './members-table';
import {
  MemberDetailDrawer,
  type MemberDetail,
  type UpdateMemberInfoArgs,
} from './member-detail-drawer';
import {
  NonMemberDetailDrawer,
  type NonMemberActionResult,
} from './non-member-detail-drawer';
import {
  AddMemberModal,
  type TeamOption,
  type AddMemberResult,
} from './add-member-modal';
import type { Role } from '@/lib/auth/effective-role';
import type { NonMemberRowDetail } from '@/actions/member-view';

export interface MembersViewProps {
  members: MemberRow[];
  scope: MembersTableScope;
  actor: { role: Role | null; isSuperadmin: boolean };
  organizationId?: string;
  teams?: TeamOption[];
  loadDetail: (memberId: string) => Promise<MemberDetail | null>;
  loadNonMemberDetail?: (rowId: string) => Promise<NonMemberRowDetail | null>;
  submitAddDirect?: (args: { email: string; role: Role }) => Promise<AddMemberResult>;
  submitAddTeam?: (args: {
    teamId: string;
    email: string;
    role: Role;
  }) => Promise<AddMemberResult>;
  onRemove?: (memberId: string) => Promise<AddMemberResult>;
  onUpdateMemberInfo?: (args: { userId: string } & UpdateMemberInfoArgs) => Promise<NonMemberActionResult>;
  onResendInvite?: (inviteId: string) => Promise<NonMemberActionResult>;
  onCancelInvite?: (inviteId: string) => Promise<NonMemberActionResult>;
  onUpdateResponsible?: (args: {
    responsibleId: string;
    email: string;
    name: string | null;
  }) => Promise<NonMemberActionResult>;
  onRemoveResponsible?: (responsibleId: string) => Promise<NonMemberActionResult>;
  onUpdateOrgLead?: (args: {
    organizationId: string;
    email: string | null;
    name: string | null;
  }) => Promise<NonMemberActionResult>;
  onConvertExternal?: (args: {
    organizationId: string;
    email: string;
    role: Role;
  }) => Promise<NonMemberActionResult>;
}

export function MembersView({
  members,
  scope,
  actor,
  organizationId,
  teams,
  loadDetail,
  loadNonMemberDetail,
  submitAddDirect,
  submitAddTeam,
  onRemove,
  onUpdateMemberInfo,
  onResendInvite,
  onCancelInvite,
  onUpdateResponsible,
  onRemoveResponsible,
  onUpdateOrgLead,
  onConvertExternal,
}: MembersViewProps) {
  const router = useRouter();
  const t = useTranslations('members');
  const [isPending, startTransition] = useTransition();
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [nonMemberDetail, setNonMemberDetail] = useState<NonMemberRowDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const closeAllDrawers = () => {
    setDetail(null);
    setNonMemberDetail(null);
  };

  const handleOpenDetail = async (rowId: string) => {
    setDetailLoading(true);
    closeAllDrawers();
    try {
      const row = members.find((m) => m.id === rowId);
      if (!row) return;
      if (row.source_kind === 'member') {
        const loaded = await loadDetail(rowId);
        setDetail(loaded);
      } else if (loadNonMemberDetail) {
        const loaded = await loadNonMemberDetail(rowId);
        setNonMemberDetail(loaded);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('errorLoadingDetails'),
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmitDirect =
    submitAddDirect
      ? async (args: { email: string; role: Role }): Promise<AddMemberResult> => {
          const res = await submitAddDirect(args);
          if (res.ok) {
            toast.success(t('toastMemberAdded'));
            startTransition(() => router.refresh());
          }
          return res;
        }
      : undefined;

  const handleSubmitTeam =
    submitAddTeam
      ? async (args: {
          teamId: string;
          email: string;
          role: Role;
        }): Promise<AddMemberResult> => {
          const res = await submitAddTeam(args);
          if (res.ok) {
            toast.success(t('toastTeamAddSuccess'));
            startTransition(() => router.refresh());
          }
          return res;
        }
      : undefined;

  const handleRemove = async (rowId: string) => {
    if (!onRemove) return;
    const res = await onRemove(rowId);
    if (res.ok) {
      toast.success(t('toastMemberRemoved'));
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error ?? t('errorRemove'));
    }
  };

  const handleUpdateInfo = async (
    args: UpdateMemberInfoArgs,
  ): Promise<NonMemberActionResult> => {
    if (!onUpdateMemberInfo || !detail) return { ok: false, error: t('editInfoErrorSave') };
    const res = await onUpdateMemberInfo({ userId: detail.user.id, ...args });
    if (res.ok) {
      toast.success(t('editInfoSaved'));
      startTransition(() => router.refresh());
    }
    return res;
  };

  const wrapNonMember = (
    fn: ((arg: string) => Promise<NonMemberActionResult>) | undefined,
  ) =>
    fn
      ? async (arg: string) => {
          const r = await fn(arg);
          if (r.ok) startTransition(() => router.refresh());
          return r;
        }
      : undefined;

  return (
    <div className="relative">
      {detailLoading && (
        <div className="fixed inset-0 z-40 pointer-events-none bg-background/20" aria-live="polite" />
      )}
      <MembersTable
        members={members}
        scope={scope}
        actor={actor}
        onOpenDetail={handleOpenDetail}
        onRemove={onRemove ? handleRemove : undefined}
        onAddMember={handleSubmitDirect ? () => setAddOpen(true) : undefined}
      />

      <MemberDetailDrawer
        detail={detail}
        onClose={() => setDetail(null)}
        onUpdateInfo={onUpdateMemberInfo ? handleUpdateInfo : undefined}
      />

      {organizationId && (
        <NonMemberDetailDrawer
          detail={nonMemberDetail}
          organizationId={organizationId}
          onClose={() => setNonMemberDetail(null)}
          onResendInvite={wrapNonMember(onResendInvite)}
          onCancelInvite={wrapNonMember(onCancelInvite)}
          onUpdateResponsible={
            onUpdateResponsible
              ? async (args) => {
                  const r = await onUpdateResponsible(args);
                  if (r.ok) startTransition(() => router.refresh());
                  return r;
                }
              : undefined
          }
          onRemoveResponsible={wrapNonMember(onRemoveResponsible)}
          onUpdateOrgLead={
            onUpdateOrgLead
              ? async (args) => {
                  const r = await onUpdateOrgLead(args);
                  if (r.ok) startTransition(() => router.refresh());
                  return r;
                }
              : undefined
          }
          onConvertExternal={
            onConvertExternal
              ? async (args) => {
                  const r = await onConvertExternal(args);
                  if (r.ok) startTransition(() => router.refresh());
                  return r;
                }
              : undefined
          }
        />
      )}

      {handleSubmitDirect && (
        <AddMemberModal
          open={addOpen}
          onOpenChange={setAddOpen}
          actor={actor}
          teams={teams}
          onSubmitDirect={handleSubmitDirect}
          onSubmitTeam={handleSubmitTeam}
        />
      )}

      {isPending && (
        <span className="sr-only" role="status">
          {t('loadingStatus')}
        </span>
      )}
    </div>
  );
}
