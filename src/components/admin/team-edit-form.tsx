'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  updateTeam,
  addTeamMemberAction,
  removeTeamMemberAction,
  grantTeamOrg,
  revokeTeamOrg,
} from '@/actions/teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  Info,
  Users,
  Building2,
  Mail,
  AlertCircle,
} from 'lucide-react';

type Role = 'viewer' | 'gestionnaire' | 'admin';

interface MemberSummary {
  user_id: string;
  email: string;
  name: string | null;
}
interface OrgSummary {
  id: string;
  name: string;
  slug: string;
}
interface GrantSummary {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: Role;
}
interface Props {
  team: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  };
  members: MemberSummary[];
  grants: GrantSummary[];
  ungrantedOrgs: OrgSummary[];
}

export function TeamEditForm({ team, members, grants, ungrantedOrgs }: Props) {
  const t = useTranslations('admin');
  return (
    <Tabs defaultValue="infos" className="w-full">
      <TabsList>
        <TabsTrigger value="infos">
          <Info className="w-3.5 h-3.5" />
          {t('teamEditTabInfos')}
        </TabsTrigger>
        <TabsTrigger value="members">
          <Users className="w-3.5 h-3.5" />
          {t('teamEditTabMembers', { count: members.length })}
        </TabsTrigger>
        <TabsTrigger value="grants">
          <Building2 className="w-3.5 h-3.5" />
          {t('teamEditTabGrants', { count: grants.length })}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="infos" className="mt-5">
        <InfosTab team={team} />
      </TabsContent>

      <TabsContent value="members" className="mt-5">
        <MembersTab teamId={team.id} initial={members} />
      </TabsContent>

      <TabsContent value="grants" className="mt-5">
        <GrantsTab
          teamId={team.id}
          initialGrants={grants}
          initialUngranted={ungrantedOrgs}
        />
      </TabsContent>
    </Tabs>
  );
}

// ─── Tab 1 : Infos ───────────────────────────────────────────────────────────

function InfosTab({
  team,
}: {
  team: { id: string; name: string; slug: string; description: string | null };
}) {
  const router = useRouter();
  const t = useTranslations('admin');
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? '');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateTeam({
          id: team.id,
          name,
          description: description.trim() || null,
        });
        toast.success(t('teamEditToastUpdated'));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="t-name">{t('teamEditNameLabel')}</Label>
        <Input
          id="t-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={255}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="t-slug">{t('teamEditSlugLabel')}</Label>
        <Input
          id="t-slug"
          value={team.slug}
          readOnly
          className="font-mono text-sm bg-muted/40"
        />
        <p className="text-[13px] text-muted-foreground">
          {t('teamEditSlugReadOnly')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="t-desc">{t('teamEditDescLabel')}</Label>
        <Textarea
          id="t-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={1000}
          className="resize-none leading-relaxed"
          disabled={isPending}
        />
      </div>

      <Button type="submit" disabled={isPending} className="gap-2">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {t('teamEditSave')}
      </Button>
    </form>
  );
}

// ─── Tab 2 : Members ─────────────────────────────────────────────────────────

function MembersTab({
  teamId,
  initial,
}: {
  teamId: string;
  initial: MemberSummary[];
}) {
  const router = useRouter();
  const t = useTranslations('admin');
  const [members, setMembers] = useState(initial);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await addTeamMemberAction({ team_id: teamId, email: trimmed });
        toast.success(t('teamEditMemberAddToast'));
        setEmail('');
        router.refresh(); // server fetches the updated list
      } catch (err) {
        setError(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  const handleRemove = (m: MemberSummary) => {
    startTransition(async () => {
      try {
        await removeTeamMemberAction({ team_id: teamId, user_id: m.user_id });
        setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id));
        toast.success(t('teamFormMemberRemoved'));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  return (
    <div className="space-y-5">
      {members.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-6 px-4 text-center">
          <p className="text-[15px] text-foreground-muted">{t('teamEditMembersEmpty')}</p>
        </div>
      ) : (
        <ul className="divide-y border border-border rounded-md overflow-hidden">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-4 px-3.5 py-2.5 bg-canvas"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-[13px] font-semibold text-primary">
                  {(m.name ?? m.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium truncate">{m.name ?? m.email}</p>
                  {m.name && (
                    <p className="text-[13px] text-foreground-subtle font-mono truncate">
                      {m.email}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleRemove(m)}
                disabled={isPending}
                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('teamEditMemberRemove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-3 pt-1">
        <div className="space-y-1.5">
          <Label htmlFor="mbr-email" className="text-[13px] font-medium text-foreground-muted flex items-center gap-1.5">
            <Mail className="w-3 h-3" />
            {t('teamEditMemberAddLabel')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="mbr-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('teamEditMemberAddPlaceholder')}
              className="h-10 flex-1"
              required
              disabled={isPending}
            />
            <Button type="submit" disabled={isPending || !email.trim()} className="h-10 gap-1.5">
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {t('teamEditMemberAdd')}
            </Button>
          </div>
          <p className="text-[13px] text-foreground-subtle">
            {t('teamEditMemberAddHint')}
          </p>
        </div>
        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-destructive/8 border border-destructive/20 text-destructive text-[14px]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}

// ─── Tab 3 : Grants ──────────────────────────────────────────────────────────

function GrantsTab({
  teamId,
  initialGrants,
  initialUngranted,
}: {
  teamId: string;
  initialGrants: GrantSummary[];
  initialUngranted: OrgSummary[];
}) {
  const router = useRouter();
  const t = useTranslations('admin');
  const [grants, setGrants] = useState(initialGrants);
  const [ungranted, setUngranted] = useState(initialUngranted);
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const roleLabel: Record<Role, string> = {
    viewer: t('roleViewer'),
    gestionnaire: t('roleGestionnaire'),
    admin: t('roleAdmin'),
  };

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!orgId) return;
    const org = ungranted.find((o) => o.id === orgId);
    if (!org) return;
    startTransition(async () => {
      try {
        await grantTeamOrg({ team_id: teamId, organization_id: orgId, role });
        setGrants((prev) => [
          ...prev,
          {
            organization_id: org.id,
            organization_name: org.name,
            organization_slug: org.slug,
            role,
          },
        ]);
        setUngranted((prev) => prev.filter((o) => o.id !== orgId));
        setOrgId('');
        setRole('viewer');
        toast.success(t('teamEditGrantGranted', { role: roleLabel[role], org: org.name }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  const handleRevoke = (g: GrantSummary) => {
    startTransition(async () => {
      try {
        await revokeTeamOrg({ team_id: teamId, organization_id: g.organization_id });
        setGrants((prev) => prev.filter((x) => x.organization_id !== g.organization_id));
        setUngranted((prev) =>
          [
            ...prev,
            {
              id: g.organization_id,
              name: g.organization_name,
              slug: g.organization_slug,
            },
          ].sort((a, b) => a.name.localeCompare(b.name)),
        );
        toast.success(t('teamEditGrantRevoked', { org: g.organization_name }));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };
  const roleVariant: Record<Role, 'secondary' | 'default' | 'destructive'> = {
    viewer: 'secondary',
    gestionnaire: 'default',
    admin: 'destructive',
  };

  return (
    <div className="space-y-5">
      {grants.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-6 px-4 text-center">
          <p className="text-[15px] text-foreground-muted">{t('teamEditGrantsEmpty')}</p>
        </div>
      ) : (
        <ul className="divide-y border border-border rounded-md overflow-hidden">
          {grants.map((g) => (
            <li
              key={g.organization_id}
              className="flex items-center justify-between gap-4 px-3.5 py-2.5 bg-canvas"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-[13px] font-semibold text-primary">
                  {g.organization_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium truncate">{g.organization_name}</p>
                  <p className="text-[13px] text-foreground-subtle font-mono truncate">
                    {g.organization_slug}
                  </p>
                </div>
                <Badge variant={roleVariant[g.role]} className="text-[12px]">
                  {roleLabel[g.role]}
                </Badge>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleRevoke(g)}
                disabled={isPending}
                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('teamEditGrantRevoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleGrant} className="space-y-3 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] gap-2 items-end">
          <div className="space-y-1.5">
            <Label
              htmlFor="grant-org"
              className="text-[13px] font-medium text-foreground-muted"
            >
              {t('teamEditGrantOrgLabel')}
            </Label>
            <select
              id="grant-org"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              disabled={isPending || ungranted.length === 0}
              className="w-full h-10 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <option value="">
                {ungranted.length === 0
                  ? t('teamEditGrantOrgNone')
                  : t('teamEditGrantOrgPlaceholder')}
              </option>
              {ungranted.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.slug})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="grant-role"
              className="text-[13px] font-medium text-foreground-muted"
            >
              {t('teamEditGrantRoleLabel')}
            </Label>
            <select
              id="grant-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={isPending}
              className="w-full h-10 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <option value="viewer">{t('roleViewer')}</option>
              <option value="gestionnaire">{t('roleGestionnaire')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
          </div>
          <Button
            type="submit"
            disabled={isPending || !orgId}
            className="h-10 gap-1.5"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {t('teamEditGrantCta')}
          </Button>
        </div>
        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-destructive/8 border border-destructive/20 text-destructive text-[14px]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}
