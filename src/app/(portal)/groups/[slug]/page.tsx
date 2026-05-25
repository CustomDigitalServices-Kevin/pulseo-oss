import { redirect } from 'next/navigation';

/**
 * /groups/[slug] bare entry — redirect to the group dashboard so a user
 * pasting `.../groups/<slug>` (without a subpath) doesn't hit a 404.
 */
export default async function GroupIndex({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/groups/${slug}/dashboard`);
}
