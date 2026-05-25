import { notFound } from 'next/navigation';
import { getGroupBySlug } from '@/lib/queries/groups';
import { PremiumGroupDashboard } from './premium-group-dashboard';

/**
 * Group dashboard — entry point for `/groups/[slug]/dashboard`.
 *
 * Access is already guarded by the layout (`canAccessGroup`); we re-call
 * `getGroupBySlug(slug)` here only to resolve the `id`. `getGroupBySlug`
 * is wrapped in `React.cache()`, so this is an in-request dedup — the DB
 * is hit once per render regardless of how many components call it.
 *
 * The dashboard itself is rendered behind the `ENABLE_GROUPS_AND_TEAMS` flag
 * at the proxy layer (Phase D), so no flag check is needed here.
 */
export default async function GroupDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) notFound();
  return <PremiumGroupDashboard groupId={group.id} groupName={group.name} />;
}
