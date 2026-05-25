import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organization_groups } from '@/lib/db/schema';

/**
 * Shape returned by {@link getGroupBySlug}.
 * Declared at the top level so callers can type their variables without
 * inferring through `ReturnType<Awaited<…>>` ladders.
 */
export type GroupBySlug = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Request-scoped cached group lookup by slug.
 *
 * Wrapping in React's `cache()` means two calls within the same RSC render
 * (e.g. `layout.tsx` gating access + `page.tsx` needing `id`) hit the DB
 * exactly once. Next.js's unstable_cache isn't used here because we want
 * request-scoped dedup, not cross-request persistence — a group's name can
 * change anytime via the admin UI.
 *
 * Returns `null` (not `undefined`) when no row matches, so callers use a
 * strict `!== null` check and TypeScript narrows cleanly.
 */
export const getGroupBySlug = cache(
  async (slug: string): Promise<GroupBySlug | null> => {
    const [group] = await db
      .select({
        id: organization_groups.id,
        name: organization_groups.name,
        slug: organization_groups.slug,
      })
      .from(organization_groups)
      .where(eq(organization_groups.slug, slug))
      .limit(1);
    return group ?? null;
  },
);
