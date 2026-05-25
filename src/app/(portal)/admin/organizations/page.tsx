import { redirect } from 'next/navigation';

/**
 * Canonical org list lives at /admin/clients. The dashboard drilldown
 * `?missing_admin=1` targets this path for readability; redirect preserves
 * query params.
 */
export default async function AdminOrganizationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') qs.set(k, v);
  }
  const query = qs.toString();
  redirect(`/admin/clients${query ? `?${query}` : ''}`);
}
