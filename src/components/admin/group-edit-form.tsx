'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  updateGroup,
  attachOrgToGroup,
  addGroupManager,
  removeGroupManager,
} from '@/actions/groups';
import { findUserByEmail } from '@/actions/admin-users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  Building2,
  ShieldCheck,
  Info,
  Mail,
  AlertCircle,
} from 'lucide-react';

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
}
interface ManagerSummary {
  user_id: string;
  email: string;
  name: string | null;
}
interface Props {
  group: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
  attachedOrgs: OrgSummary[];
  unattachedOrgs: OrgSummary[];
  managers: ManagerSummary[];
}

export function GroupEditForm({ group, attachedOrgs, unattachedOrgs, managers }: Props) {
  const t = useTranslations('admin');
  return (
    <Tabs defaultValue="infos" className="w-full">
      <TabsList>
        <TabsTrigger value="infos">
          <Info className="w-3.5 h-3.5" />
          {t('groupEditTabInfos')}
        </TabsTrigger>
        <TabsTrigger value="orgs">
          <Building2 className="w-3.5 h-3.5" />
          {t('groupEditTabOrgs', { count: attachedOrgs.length })}
        </TabsTrigger>
        <TabsTrigger value="managers">
          <ShieldCheck className="w-3.5 h-3.5" />
          {t('groupEditTabManagers', { count: managers.length })}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="infos" className="mt-5">
        <InfosTab group={group} />
      </TabsContent>

      <TabsContent value="orgs" className="mt-5">
        <OrgsTab
          groupId={group.id}
          initialAttached={attachedOrgs}
          initialUnattached={unattachedOrgs}
        />
      </TabsContent>

      <TabsContent value="managers" className="mt-5">
        <ManagersTab groupId={group.id} initial={managers} />
      </TabsContent>
    </Tabs>
  );
}

// ─── Tab 1 : Infos ───────────────────────────────────────────────────────────

function InfosTab({
  group,
}: {
  group: { id: string; name: string; slug: string; logo_url: string | null };
}) {
  const router = useRouter();
  const t = useTranslations('admin');
  const [name, setName] = useState(group.name);
  const [logoUrl, setLogoUrl] = useState(group.logo_url ?? '');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateGroup({
          id: group.id,
          name,
          logo_url: logoUrl.trim() || null,
        });
        toast.success(t('groupFormSaved'));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="g-name">{t('groupEditNameLabel')}</Label>
        <Input
          id="g-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={255}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="g-slug">{t('groupEditSlugLabel')}</Label>
        <Input
          id="g-slug"
          value={group.slug}
          readOnly
          className="font-mono text-sm bg-muted/40"
        />
        <p className="text-[13px] text-muted-foreground">
          {t('groupEditSlugReadOnly')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="g-logo">{t('groupEditLogoLabel')}</Label>
        <Input
          id="g-logo"
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://exemple.com/logo.png"
          disabled={isPending}
        />
      </div>

      <Button type="submit" disabled={isPending} className="gap-2">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {t('groupEditSave')}
      </Button>
    </form>
  );
}

// ─── Tab 2 : Orgs ────────────────────────────────────────────────────────────

function OrgsTab({
  groupId,
  initialAttached,
  initialUnattached,
}: {
  groupId: string;
  initialAttached: OrgSummary[];
  initialUnattached: OrgSummary[];
}) {
  const router = useRouter();
  const t = useTranslations('admin');
  const [attached, setAttached] = useState(initialAttached);
  const [unattached, setUnattached] = useState(initialUnattached);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleAttach = () => {
    if (!selectedOrgId) return;
    const org = unattached.find((o) => o.id === selectedOrgId);
    if (!org) return;
    startTransition(async () => {
      try {
        await attachOrgToGroup({ organization_id: selectedOrgId, group_id: groupId });
        setAttached((prev) => [...prev, org]);
        setUnattached((prev) => prev.filter((o) => o.id !== selectedOrgId));
        setSelectedOrgId('');
        toast.success(t('groupEditOrgAttached', { name: org.name }));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  const handleDetach = (org: OrgSummary) => {
    startTransition(async () => {
      try {
        await attachOrgToGroup({ organization_id: org.id, group_id: null });
        setAttached((prev) => prev.filter((o) => o.id !== org.id));
        setUnattached((prev) => [...prev, org].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success(t('groupEditOrgDetached', { name: org.name }));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  return (
    <div className="space-y-5">
      {attached.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-6 px-4 text-center">
          <p className="text-[15px] text-foreground-muted">{t('groupEditOrgsEmpty')}</p>
        </div>
      ) : (
        <ul className="divide-y border border-border rounded-md overflow-hidden">
          {attached.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-4 px-3.5 py-2.5 bg-canvas"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-[13px] font-semibold text-primary">
                  {o.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium truncate">{o.name}</p>
                  <p className="text-[13px] text-foreground-subtle font-mono truncate">
                    {o.slug}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleDetach(o)}
                disabled={isPending}
                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('groupEditDetach')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-1">
        <Label htmlFor="attach-org" className="text-[13px] font-medium text-foreground-muted">
          {t('groupEditAddOrgLabel')}
        </Label>
        <div className="flex gap-2 mt-1.5">
          <select
            id="attach-org"
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            disabled={isPending || unattached.length === 0}
            className="flex-1 h-10 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="">
              {unattached.length === 0
                ? t('groupEditNoUnattachedOrgs')
                : t('groupEditSelectOrgPlaceholder')}
            </option>
            {unattached.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.slug})
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={handleAttach}
            disabled={isPending || !selectedOrgId}
            className="h-10 gap-1.5"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {t('groupEditAttachCta')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 3 : Managers ────────────────────────────────────────────────────────

function ManagersTab({
  groupId,
  initial,
}: {
  groupId: string;
  initial: ManagerSummary[];
}) {
  const router = useRouter();
  const t = useTranslations('admin');
  const [managers, setManagers] = useState(initial);
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
        const user = await findUserByEmail(trimmed);
        if (!user) {
          setError(t('groupEditManagerNotFound'));
          return;
        }
        if (managers.some((m) => m.user_id === user.id)) {
          setError(t('groupFormManagerAlreadySet'));
          return;
        }
        await addGroupManager({ group_id: groupId, user_id: user.id });
        setManagers((prev) => [
          ...prev,
          { user_id: user.id, email: user.email, name: user.name },
        ]);
        setEmail('');
        toast.success(t('groupEditManagerAdded', { email: user.email }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  const handleRemove = (m: ManagerSummary) => {
    startTransition(async () => {
      try {
        await removeGroupManager({ group_id: groupId, user_id: m.user_id });
        setManagers((prev) => prev.filter((x) => x.user_id !== m.user_id));
        toast.success(t('groupFormManagerRemoved'));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('genericError'));
      }
    });
  };

  return (
    <div className="space-y-5">
      {managers.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-6 px-4 text-center">
          <p className="text-[15px] text-foreground-muted">{t('groupEditManagersEmpty')}</p>
          <p className="text-[13px] text-foreground-subtle mt-1">
            {t('groupEditManagersEmptyHint')}
          </p>
        </div>
      ) : (
        <ul className="divide-y border border-border rounded-md overflow-hidden">
          {managers.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-4 px-3.5 py-2.5 bg-canvas"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-[13px] font-semibold text-primary">
                  {(m.name ?? m.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium truncate">
                    {m.name ?? m.email}
                  </p>
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
                {t('groupEditRemove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-3 pt-1">
        <div className="space-y-1.5">
          <Label
            htmlFor="mgr-email"
            className="text-[13px] font-medium text-foreground-muted flex items-center gap-1.5"
          >
            <Mail className="w-3 h-3" />
            {t('groupEditManagerEmailLabel')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="mgr-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('groupEditManagerEmailPlaceholder')}
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
              {t('groupEditManagerAdd')}
            </Button>
          </div>
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
