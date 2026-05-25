import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { getGroupBySlug } from '@/lib/queries/groups';

export default async function GroupOrganizationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations('groups');
  const group = await getGroupBySlug(slug);
  if (!group) return null;

  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(eq(organizations.group_id, group.id));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {t('orgsPageTitle', { name: group.name })}
      </h1>
      <p className="text-muted-foreground mb-6">
        {t('orgsPageSubtitle', { count: orgs.length })}
      </p>
      <div className="space-y-2">
        {orgs.map((o) => (
          <Link
            key={o.id}
            href={`/clients/${o.slug}`}
            className="flex items-center justify-between p-4 border rounded hover:border-primary"
          >
            <div>
              <div className="font-medium">{o.name}</div>
              <div className="text-xs text-muted-foreground">
                /clients/{o.slug}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">{t('orgsOpen')}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
