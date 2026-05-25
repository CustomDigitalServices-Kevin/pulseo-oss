import { getOrganization } from '@/actions/organizations';
import { BrandingProvider } from '@/components/layout/branding-provider';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';
import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { requireSession } from '@/lib/auth/session';
import { canAccessGroup, canAccessOrg } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { organization_groups } from '@/lib/db/schema';

export default async function ClientPortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const t = await getTranslations('clients');
  const { slug } = await params;
  const orgResult = await getOrganization(slug);

  if (!orgResult.success || !orgResult.data) {
    notFound();
  }

  const org = orgResult.data;

  // RBAC unifié : un user peut atteindre /clients/<slug> via membership
  // direct, gestionnaire-via-groupe, ou grant team. canAccessOrg court-circuite
  // déjà sur is_superadmin et délègue à getEffectiveRole pour les 3 sources.
  const hasAccess = await canAccessOrg(session.user.id, org.id);
  if (!hasAccess) {
    notFound();
  }

  // Parent group breadcrumb CTA — visible only when the org belongs to a
  // group AND the current user can access that group (superadmin ou manager).
  let parentGroup: { name: string; slug: string } | null = null;
  if (org.group_id) {
    const [row] = await db
      .select({
        id: organization_groups.id,
        name: organization_groups.name,
        slug: organization_groups.slug,
      })
      .from(organization_groups)
      .where(eq(organization_groups.id, org.group_id))
      .limit(1);
    if (row && (await canAccessGroup(session.user.id, row.id))) {
      parentGroup = { name: row.name, slug: row.slug };
    }
  }

  return (
    <BrandingProvider
      colorPrimary={org.color_primary ?? '#2563EB'}
      colorSecondary={org.color_secondary ?? '#1E40AF'}
      orgName={org.name}
    >
      {/* Conteneur transparent — le fond animé + le voile `bg-background/40` du
          `<main>` portal-layout gèrent déjà la couleur et la lisibilité. Un
          `bg-background` opaque ici masquerait complètement les spots. */}
      <div className="min-h-screen">
        {parentGroup && (
          <div className="max-w-7xl mx-auto px-6 pt-4">
            <Link
              href={`/groups/${parentGroup.slug}/dashboard`}
              className="text-sm text-primary hover:underline inline-block"
            >
              {t('parentGroupLink', { name: parentGroup.name })}
            </Link>
          </div>
        )}
        {children}
      </div>
    </BrandingProvider>
  );
}
