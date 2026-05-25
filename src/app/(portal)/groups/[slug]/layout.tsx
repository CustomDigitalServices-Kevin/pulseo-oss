import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getSessionInfo } from '@/lib/auth/session';
import { canAccessGroup } from '@/lib/auth/permissions';
import { getGroupBySlug } from '@/lib/queries/groups';

export default async function GroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionInfo();
  if (!session) redirect('/login');
  const t = await getTranslations('groups');

  const group = await getGroupBySlug(slug);

  if (!group) notFound();

  if (!(await canAccessGroup(session.userId, group.id))) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <h1 className="text-2xl font-semibold mb-4">{t('accessDenied')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('accessDeniedHint')}
        </p>
        <Link href="/me" className="text-primary underline">
          {t('backToSpaces')}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <GroupBreadcrumb
        name={group.name}
        ariaLabel={t('breadcrumbAria')}
        mySpacesLabel={t('breadcrumbMySpaces')}
      />
      {children}
    </div>
  );
}

function GroupBreadcrumb({
  name,
  ariaLabel,
  mySpacesLabel,
}: {
  name: string;
  ariaLabel: string;
  mySpacesLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="text-sm text-muted-foreground">
      <ol className="flex items-center gap-2">
        <li>
          <Link href="/me" className="hover:text-foreground">
            {mySpacesLabel}
          </Link>
        </li>
        <li aria-hidden>/</li>
        <li className="text-foreground font-medium">{name}</li>
      </ol>
    </nav>
  );
}
