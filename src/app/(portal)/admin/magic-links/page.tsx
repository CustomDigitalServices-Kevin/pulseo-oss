import { listOrganizations } from '@/actions/organizations';
import { listInviteLinks } from '@/actions/invite-links';
import { MagicLinkForm } from '@/components/admin/magic-link-form';
import { InviteLinkManager } from '@/components/admin/invite-link-manager';
import { LinkIcon, UserPlus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getTranslations } from 'next-intl/server';

export default async function MagicLinksPage() {
  const t = await getTranslations('admin');
  const [organizations, inviteLinks] = await Promise.all([
    listOrganizations(),
    listInviteLinks(),
  ]);

  const orgsMinimal = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    color_primary: org.color_primary,
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background: 'linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.205 264) 100%, white 12%), oklch(0.625 0.205 264))',
            borderColor: 'color-mix(in oklch, oklch(0.625 0.205 264) 50%, transparent)',
            boxShadow: '0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px oklch(0.625 0.205 264 / 0.45)',
          }}
        >
          <LinkIcon className="w-4 h-4 text-white relative z-10" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
            {t('invitationsTitle')}
          </h1>
          <p className="text-[15px] text-foreground-muted mt-1">
            {t('invitationsSubtitle')}
          </p>
        </div>
      </div>

      <Tabs defaultValue="magic-links">
        <TabsList>
          <TabsTrigger value="magic-links">
            <LinkIcon className="w-4 h-4 mr-1.5" />
            {t('tabMagicLinks')}
          </TabsTrigger>
          <TabsTrigger value="invite-links">
            <UserPlus className="w-4 h-4 mr-1.5" />
            {t('tabInviteLinks')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="magic-links" className="mt-5">
          <MagicLinkForm organizations={orgsMinimal} />
        </TabsContent>

        <TabsContent value="invite-links" className="mt-5">
          <InviteLinkManager
            organizations={orgsMinimal}
            initialLinks={inviteLinks
              // The InviteLinkManager UI only renders org-scoped links;
              // team-scoped links are managed from /admin/teams.
              .filter((link): link is typeof link & { organization: NonNullable<typeof link.organization> } => link.organization !== null)
              .map((link) => ({
                id: link.id,
                token: link.token,
                label: link.label,
                is_active: link.is_active,
                use_count: link.use_count,
                expires_at: link.expires_at ? link.expires_at.toISOString() : null,
                created_at: link.created_at.toISOString(),
                organization: link.organization,
              }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
