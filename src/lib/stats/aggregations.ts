/**
 * Stats / aggregations module.
 *
 * Design: each stat is exposed as a pair of exports:
 *   - `*Raw` — pure uncached async function. Tests call these directly.
 *   - Cached wrapper (same name without `Raw`) — closes over `unstable_cache`
 *     with a 5-minute `revalidate`. Production callers use these.
 *
 * Cache keys + tags are entity-scoped (e.g. `stats:org:${orgId}`) so that a
 * ticket write on one org can invalidate just that org's stats without nuking
 * the whole `stats` namespace. The generic `stats` tag is kept as an escape
 * hatch for bulk invalidation.
 *
 * This split avoids cached results leaking across `resetDb()` calls in tests
 * and keeps the cache concern out of the SQL.
 *
 * All queries are scope-aware:
 *   - global : no filter
 *   - group  : filter tickets via `organizations.group_id = $groupId`
 *   - org    : filter tickets via `organizations.id = $orgId`
 *
 * Open statuses (see src/app/(portal)/admin/dashboard/page.tsx):
 *   'new' | 'in_progress' | 'waiting_client'
 *
 * Overdue definition:
 *   resolution_due_at < NOW() AND status NOT IN ('resolved','closed')
 *
 * NOTE: `KpiSeries[]` return values are **sparse** — days with zero tickets
 * are omitted (no zero-fill). Consumers rendering a continuous chart must
 * zero-fill the 30-day window themselves.
 */

import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────

export type KpiSeries = { date: string; count: number };

export type GlobalStats = {
  open_tickets: number;
  overdue_tickets: number;
  active_users_7d: number;
  created_last_30d: KpiSeries[];
};

export type OrgStats = {
  open_tickets: number;
  overdue_tickets: number;
  total_tickets_30d: number;
  created_last_30d: KpiSeries[];
};

export type GroupStats = OrgStats & {
  org_count: number;
  active_users_7d: number;
};

export type TopOrgRow = {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  open_tickets: number;
  overdue_tickets: number;
  created_30d: number;
};

export type HeatmapCell = {
  day_of_week: number; // 0-6, 0=Sunday
  hour: number;        // 0-23
  count: number;
};

export type StatsScope =
  | { type: 'global' }
  | { type: 'group'; id: string }
  | { type: 'org'; id: string };

export type MedianResponseArgs = {
  scope: StatsScope;
  userId?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Rows<T> = { rows: T[] };

function rowsOf<T>(result: unknown): T[] {
  return (result as Rows<T>).rows ?? [];
}

/**
 * Normalise a `d` column coming from Postgres to a `YYYY-MM-DD` string.
 *
 * Postgres `DATE(...)` can come back as a `Date` object (node-postgres) or as
 * a plain string like `"2025-01-05"` (PGlite). Both paths are handled.
 * We intentionally do NOT use `toISOString()` on a raw `Date` because the
 * driver returns a local-midnight Date that, when converted to ISO UTC, can
 * flip to the previous day. We read year/month/day directly.
 */
function toYmd(d: unknown): string {
  if (typeof d === 'string') {
    // Already `YYYY-MM-DD` (possibly with time suffix); trim to 10 chars.
    return d.slice(0, 10);
  }
  if (d instanceof Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d);
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return 0;
}

// ─── getGlobalStatsRaw ───────────────────────────────────────────────────────

export async function getGlobalStatsRaw(): Promise<GlobalStats> {
  const [openRes, overdueRes, activeRes, seriesRes] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS n FROM tickets
       WHERE status IN ('new','in_progress','waiting_client')
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS n FROM tickets
       WHERE resolution_due_at IS NOT NULL
         AND resolution_due_at < NOW()
         AND status NOT IN ('resolved','closed')
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS n FROM user_activity_events
       WHERE created_at > NOW() - INTERVAL '7 days'
    `),
    db.execute(sql`
      SELECT DATE(created_at AT TIME ZONE 'UTC') AS d, COUNT(*)::int AS n
        FROM tickets
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at AT TIME ZONE 'UTC')
       ORDER BY DATE(created_at AT TIME ZONE 'UTC')
    `),
  ]);

  const openRow = rowsOf<{ n: number }>(openRes)[0];
  const overdueRow = rowsOf<{ n: number }>(overdueRes)[0];
  const activeRow = rowsOf<{ n: number }>(activeRes)[0];
  const seriesRows = rowsOf<{ d: unknown; n: number }>(seriesRes);

  return {
    open_tickets: toNum(openRow?.n),
    overdue_tickets: toNum(overdueRow?.n),
    active_users_7d: toNum(activeRow?.n),
    created_last_30d: seriesRows.map((r) => ({ date: toYmd(r.d), count: toNum(r.n) })),
  };
}

// ─── getOrgStatsRaw ──────────────────────────────────────────────────────────

export async function getOrgStatsRaw(orgId: string): Promise<OrgStats> {
  const [openRes, overdueRes, total30Res, seriesRes] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS n FROM tickets
       WHERE organization_id = ${orgId}
         AND status IN ('new','in_progress','waiting_client')
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS n FROM tickets
       WHERE organization_id = ${orgId}
         AND resolution_due_at IS NOT NULL
         AND resolution_due_at < NOW()
         AND status NOT IN ('resolved','closed')
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS n FROM tickets
       WHERE organization_id = ${orgId}
         AND created_at > NOW() - INTERVAL '30 days'
    `),
    db.execute(sql`
      SELECT DATE(created_at AT TIME ZONE 'UTC') AS d, COUNT(*)::int AS n
        FROM tickets
       WHERE organization_id = ${orgId}
         AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at AT TIME ZONE 'UTC')
       ORDER BY DATE(created_at AT TIME ZONE 'UTC')
    `),
  ]);

  const openRow = rowsOf<{ n: number }>(openRes)[0];
  const overdueRow = rowsOf<{ n: number }>(overdueRes)[0];
  const total30Row = rowsOf<{ n: number }>(total30Res)[0];
  const seriesRows = rowsOf<{ d: unknown; n: number }>(seriesRes);

  return {
    open_tickets: toNum(openRow?.n),
    overdue_tickets: toNum(overdueRow?.n),
    total_tickets_30d: toNum(total30Row?.n),
    created_last_30d: seriesRows.map((r) => ({ date: toYmd(r.d), count: toNum(r.n) })),
  };
}

// ─── getGroupStatsRaw ────────────────────────────────────────────────────────

export async function getGroupStatsRaw(groupId: string): Promise<GroupStats> {
  const [openRes, overdueRes, total30Res, seriesRes, orgCountRes, activeRes] =
    await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS n FROM tickets
         WHERE organization_id IN (
                 SELECT id FROM organizations WHERE group_id = ${groupId}
               )
           AND status IN ('new','in_progress','waiting_client')
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS n FROM tickets
         WHERE organization_id IN (
                 SELECT id FROM organizations WHERE group_id = ${groupId}
               )
           AND resolution_due_at IS NOT NULL
           AND resolution_due_at < NOW()
           AND status NOT IN ('resolved','closed')
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS n FROM tickets
         WHERE organization_id IN (
                 SELECT id FROM organizations WHERE group_id = ${groupId}
               )
           AND created_at > NOW() - INTERVAL '30 days'
      `),
      db.execute(sql`
        SELECT DATE(created_at AT TIME ZONE 'UTC') AS d, COUNT(*)::int AS n
          FROM tickets
         WHERE organization_id IN (
                 SELECT id FROM organizations WHERE group_id = ${groupId}
               )
           AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at AT TIME ZONE 'UTC')
         ORDER BY DATE(created_at AT TIME ZONE 'UTC')
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS n FROM organizations WHERE group_id = ${groupId}
      `),
      db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS n FROM user_activity_events
         WHERE created_at > NOW() - INTERVAL '7 days'
           AND organization_id IN (
                 SELECT id FROM organizations WHERE group_id = ${groupId}
               )
      `),
    ]);

  const openRow = rowsOf<{ n: number }>(openRes)[0];
  const overdueRow = rowsOf<{ n: number }>(overdueRes)[0];
  const total30Row = rowsOf<{ n: number }>(total30Res)[0];
  const seriesRows = rowsOf<{ d: unknown; n: number }>(seriesRes);
  const orgCountRow = rowsOf<{ n: number }>(orgCountRes)[0];
  const activeRow = rowsOf<{ n: number }>(activeRes)[0];

  return {
    open_tickets: toNum(openRow?.n),
    overdue_tickets: toNum(overdueRow?.n),
    total_tickets_30d: toNum(total30Row?.n),
    created_last_30d: seriesRows.map((r) => ({ date: toYmd(r.d), count: toNum(r.n) })),
    org_count: toNum(orgCountRow?.n),
    active_users_7d: toNum(activeRow?.n),
  };
}

// ─── getTopOrgsRaw ───────────────────────────────────────────────────────────

type TopOrgsArgs = { limit: number; scope: StatsScope };

export async function getTopOrgsRaw(args: TopOrgsArgs): Promise<TopOrgRow[]> {
  const { limit, scope } = args;
  const limitInt = Math.max(1, Math.min(1000, Math.floor(limit)));

  // Build the org-filter clause based on scope.
  let filter = sql``;
  if (scope.type === 'group') {
    filter = sql`WHERE o.group_id = ${scope.id}`;
  } else if (scope.type === 'org') {
    filter = sql`WHERE o.id = ${scope.id}`;
  }

  const res = await db.execute(sql`
    SELECT
      o.id   AS organization_id,
      o.slug AS organization_slug,
      o.name AS organization_name,
      COALESCE(SUM(CASE WHEN t.status IN ('new','in_progress','waiting_client')
                        THEN 1 ELSE 0 END), 0)::int AS open_tickets,
      COALESCE(SUM(CASE WHEN t.resolution_due_at IS NOT NULL
                        AND t.resolution_due_at < NOW()
                        AND t.status NOT IN ('resolved','closed')
                        THEN 1 ELSE 0 END), 0)::int AS overdue_tickets,
      COALESCE(SUM(CASE WHEN t.created_at > NOW() - INTERVAL '30 days'
                        THEN 1 ELSE 0 END), 0)::int AS created_30d
    FROM organizations o
    LEFT JOIN tickets t ON t.organization_id = o.id
    ${filter}
    -- PGlite planner needs all non-aggregate columns listed explicitly
    GROUP BY o.id, o.slug, o.name
    ORDER BY open_tickets DESC, created_30d DESC, o.name ASC
    LIMIT ${limitInt}
  `);

  const rows = rowsOf<{
    organization_id: string;
    organization_slug: string;
    organization_name: string;
    open_tickets: number;
    overdue_tickets: number;
    created_30d: number;
  }>(res);

  return rows.map((r) => ({
    organization_id: r.organization_id,
    organization_slug: r.organization_slug,
    organization_name: r.organization_name,
    open_tickets: toNum(r.open_tickets),
    overdue_tickets: toNum(r.overdue_tickets),
    created_30d: toNum(r.created_30d),
  }));
}

// ─── getUserSparkline30dRaw ──────────────────────────────────────────────────

export async function getUserSparkline30dRaw(userId: string): Promise<KpiSeries[]> {
  const res = await db.execute(sql`
    SELECT DATE(created_at AT TIME ZONE 'UTC') AS d, COUNT(*)::int AS n
      FROM user_activity_events
     WHERE user_id = ${userId}
       AND event_type IN ('ticket_created','ticket_commented')
       AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY DATE(created_at AT TIME ZONE 'UTC')
     ORDER BY DATE(created_at AT TIME ZONE 'UTC')
  `);
  const rows = rowsOf<{ d: unknown; n: number }>(res);
  return rows.map((r) => ({ date: toYmd(r.d), count: toNum(r.n) }));
}

// ─── getUserHeatmapRaw ───────────────────────────────────────────────────────

export async function getUserHeatmapRaw(userId: string): Promise<HeatmapCell[]> {
  const res = await db.execute(sql`
    SELECT
      EXTRACT(DOW  FROM created_at AT TIME ZONE 'UTC')::int AS day_of_week,
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
      COUNT(*)::int AS n
    FROM user_activity_events
    WHERE user_id = ${userId}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
  const rows = rowsOf<{ day_of_week: number; hour: number; n: number }>(res);
  return rows.map((r) => ({
    day_of_week: toNum(r.day_of_week),
    hour: toNum(r.hour),
    count: toNum(r.n),
  }));
}

// ─── getOrgCountStatsRaw ─────────────────────────────────────────────────────

export type OrgCountStats = {
  total: number;
  new_this_month: number;
};

/**
 * Organisation counts — total + new orgs this month.
 *
 * Single query with `FILTER (WHERE …)` conditional aggregate. PGlite and
 * Postgres both support `date_trunc('month', NOW())`. If a trend delta
 * (this-month vs last-month) is needed later, add a separate helper rather
 * than bloating this return shape.
 */
export async function getOrgCountStatsRaw(): Promise<OrgCountStats> {
  const res = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS new_this_month
    FROM organizations
  `);
  const row = rowsOf<{ total: number; new_this_month: number }>(res)[0];
  return {
    total: toNum(row?.total),
    new_this_month: toNum(row?.new_this_month),
  };
}

// ─── getOrgsWithoutAdminCountRaw ─────────────────────────────────────────────

/**
 * Count orgs that do NOT have any `organization_members` with `role='admin'`.
 * Role literal matches the convention documented on schema line 147.
 */
export async function getOrgsWithoutAdminCountRaw(): Promise<number> {
  const res = await db.execute(sql`
    SELECT COUNT(*)::int AS n
      FROM organizations o
     WHERE NOT EXISTS (
       SELECT 1 FROM organization_members m
        WHERE m.organization_id = o.id
          AND m.role = 'admin'
     )
  `);
  const row = rowsOf<{ n: number }>(res)[0];
  return toNum(row?.n);
}

// ─── getResolvedLast30dRaw ───────────────────────────────────────────────────

/**
 * Tickets « résolus » sur les 30 derniers jours, série journalière (sparse).
 *
 * NOTE: le schéma ne contient pas `resolved_at` — on utilise `closed_at` comme
 * proxy (une résolution se concrétise par une fermeture). Les tickets bloqués
 * sur `status='resolved'` sans jamais être fermés ne sont pas comptés — trade
 * assumé, à revoir si un `resolved_at` est ajouté au schéma.
 */
export async function getResolvedLast30dRaw(): Promise<KpiSeries[]> {
  const res = await db.execute(sql`
    SELECT DATE(closed_at AT TIME ZONE 'UTC') AS d, COUNT(*)::int AS n
      FROM tickets
     WHERE closed_at IS NOT NULL
       AND closed_at > NOW() - INTERVAL '30 days'
     GROUP BY DATE(closed_at AT TIME ZONE 'UTC')
     ORDER BY DATE(closed_at AT TIME ZONE 'UTC')
  `);
  const rows = rowsOf<{ d: unknown; n: number }>(res);
  return rows.map((r) => ({ date: toYmd(r.d), count: toNum(r.n) }));
}

// ─── getPriorWindowTotalRaw ──────────────────────────────────────────────────

/**
 * Total tickets créés dans la fenêtre « J-60 à J-30 », utilisé pour calculer
 * le delta vs. la fenêtre courante (30 derniers jours) sans muter
 * `GlobalStats`.
 */
export async function getPriorWindowTotalRaw(): Promise<{ prior_30d_total: number }> {
  const res = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM tickets
     WHERE created_at > NOW() - INTERVAL '60 days'
       AND created_at <= NOW() - INTERVAL '30 days'
  `);
  const row = rowsOf<{ n: number }>(res)[0];
  return { prior_30d_total: toNum(row?.n) };
}

// ─── getCreatedLast30dByOrgInGroupRaw ────────────────────────────────────────

export type PerOrgSeries = {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  data: KpiSeries[];
};

/**
 * Per-org 30-day ticket creation series, scoped to a single group.
 *
 * Returns **one entry per org in the group** — including orgs with zero
 * tickets in the window (their `data` is `[]`). Keeping empty-data rows
 * ensures the group dashboard chart legend shows every filiale, even ones
 * that have been quiet; the user can then toggle series visibility.
 *
 * SQL strategy: single LEFT JOIN from `organizations` to `tickets` with the
 * 30-day window in the join predicate (so orgs with zero tickets survive the
 * left join). Pivot `(org, day) → count` rows into per-org `KpiSeries[]`
 * in JS — no need to keep a day column on orgs-with-no-tickets (a zero row
 * with NULL date collapses to an empty array naturally).
 *
 * Returns series sorted by org name for a stable legend order.
 */
export async function getCreatedLast30dByOrgInGroupRaw(
  groupId: string,
): Promise<PerOrgSeries[]> {
  const res = await db.execute(sql`
    SELECT
      o.id   AS organization_id,
      o.slug AS organization_slug,
      o.name AS organization_name,
      DATE(t.created_at AT TIME ZONE 'UTC') AS d,
      COUNT(t.id)::int AS n
    FROM organizations o
    LEFT JOIN tickets t
      ON t.organization_id = o.id
     AND t.created_at > NOW() - INTERVAL '30 days'
    WHERE o.group_id = ${groupId}
    GROUP BY o.id, o.slug, o.name, DATE(t.created_at AT TIME ZONE 'UTC')
    ORDER BY o.name ASC, DATE(t.created_at AT TIME ZONE 'UTC') ASC
  `);

  const rows = rowsOf<{
    organization_id: string;
    organization_slug: string;
    organization_name: string;
    d: unknown;
    n: number;
  }>(res);

  // Pivot to per-org series. Rows with NULL `d` come from the LEFT JOIN when
  // an org has zero tickets in the window — we still want the org in the
  // output, but with an empty data array.
  const byOrg = new Map<string, PerOrgSeries>();
  for (const r of rows) {
    let entry = byOrg.get(r.organization_id);
    if (!entry) {
      entry = {
        organization_id: r.organization_id,
        organization_slug: r.organization_slug,
        organization_name: r.organization_name,
        data: [],
      };
      byOrg.set(r.organization_id, entry);
    }
    if (r.d !== null && r.d !== undefined) {
      entry.data.push({ date: toYmd(r.d), count: toNum(r.n) });
    }
  }

  // Preserve the SQL ORDER BY o.name — Map iteration is insertion-ordered.
  return Array.from(byOrg.values());
}

// ─── getMedianResponseTimeRaw ────────────────────────────────────────────────

export async function getMedianResponseTimeRaw(
  args: MedianResponseArgs,
): Promise<{ median_minutes: number | null }> {
  const { scope, userId } = args;

  // Build WHERE fragments.
  let scopeClause = sql``;
  if (scope.type === 'org') {
    scopeClause = sql`AND t.organization_id = ${scope.id}`;
  } else if (scope.type === 'group') {
    scopeClause = sql`AND t.organization_id IN (
      SELECT id FROM organizations WHERE group_id = ${scope.id}
    )`;
  }
  const userClause = userId ? sql`AND t.creator_id = ${userId}` : sql``;

  // Try percentile_cont first (Postgres / recent PGlite). If the engine does
  // not support the function, fall back to JS median. Only the specific
  // "function not supported" class is swallowed — any other error (FK, syntax,
  // connection, etc.) re-throws so it surfaces in monitoring.
  try {
    const res = await db.execute(sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (t.responded_at - t.created_at)) / 60.0
      ) AS median
      FROM tickets t
      WHERE t.responded_at IS NOT NULL
        ${scopeClause}
        ${userClause}
    `);
    const row = rowsOf<{ median: unknown }>(res)[0];
    const m = row?.median;
    if (m === null || m === undefined) return { median_minutes: null };
    return { median_minutes: toNum(m) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Whitelist only the "feature unsupported / function missing" class.
    // Postgres error code 42883 is "undefined_function"; PGlite surfaces the
    // text so we match on it explicitly.
    if (
      !/percentile_cont|not supported|unsupported|does not exist|function .* does not exist/i.test(msg)
    ) {
      throw err;
    }
    // Fallback: fetch durations and compute median in JS.
    const res = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (t.responded_at - t.created_at)) / 60.0 AS m
        FROM tickets t
       WHERE t.responded_at IS NOT NULL
         ${scopeClause}
         ${userClause}
    `);
    const rows = rowsOf<{ m: unknown }>(res);
    const vals = rows.map((r) => toNum(r.m)).sort((a, b) => a - b);
    if (vals.length === 0) return { median_minutes: null };
    const mid = Math.floor(vals.length / 2);
    const median = vals.length % 2 === 1
      ? vals[mid]
      : (vals[mid - 1] + vals[mid]) / 2;
    return { median_minutes: median };
  }
}

// ─── Cached wrappers (production callers use these) ──────────────────────────
//
// Each wrapper closes over `unstable_cache` so that keyParts AND tags carry
// the entity discriminator (orgId, groupId, userId, scope). This enables
// per-entity `revalidateTag('stats:org:<id>')` without blowing away the whole
// `stats` namespace on every ticket write.
//
// Signature note: these are plain async functions (not `unstable_cache`
// values). Call sites that already did `getOrgStats(orgId)` keep working.

export function getGlobalStats(): Promise<GlobalStats> {
  return unstable_cache(
    () => getGlobalStatsRaw(),
    ['stats:global'],
    { revalidate: 300, tags: ['stats', 'stats:global'] },
  )();
}

export function getOrgStats(orgId: string): Promise<OrgStats> {
  return unstable_cache(
    () => getOrgStatsRaw(orgId),
    ['stats:org', orgId],
    { revalidate: 300, tags: ['stats', `stats:org:${orgId}`] },
  )();
}

export function getGroupStats(groupId: string): Promise<GroupStats> {
  return unstable_cache(
    () => getGroupStatsRaw(groupId),
    ['stats:group', groupId],
    { revalidate: 300, tags: ['stats', `stats:group:${groupId}`] },
  )();
}

export function getTopOrgs(args: TopOrgsArgs): Promise<TopOrgRow[]> {
  const scopeId = args.scope.type === 'global' ? 'global' : args.scope.id;
  const scopeTag =
    args.scope.type === 'global'
      ? 'stats:global'
      : `stats:${args.scope.type}:${args.scope.id}`;
  return unstable_cache(
    () => getTopOrgsRaw(args),
    ['stats:top-orgs', args.scope.type, scopeId, String(args.limit)],
    { revalidate: 300, tags: ['stats', scopeTag] },
  )();
}

export function getUserSparkline30d(userId: string): Promise<KpiSeries[]> {
  return unstable_cache(
    () => getUserSparkline30dRaw(userId),
    ['stats:user-sparkline', userId],
    { revalidate: 300, tags: ['stats', `stats:user:${userId}`] },
  )();
}

export function getUserHeatmap(userId: string): Promise<HeatmapCell[]> {
  return unstable_cache(
    () => getUserHeatmapRaw(userId),
    ['stats:user-heatmap', userId],
    { revalidate: 300, tags: ['stats', `stats:user:${userId}`] },
  )();
}

export function getOrgCountStats(): Promise<OrgCountStats> {
  return unstable_cache(
    () => getOrgCountStatsRaw(),
    ['stats:org-count'],
    { revalidate: 300, tags: ['stats', 'stats:global'] },
  )();
}

export function getOrgsWithoutAdminCount(): Promise<number> {
  return unstable_cache(
    () => getOrgsWithoutAdminCountRaw(),
    ['stats:orgs-without-admin'],
    { revalidate: 300, tags: ['stats', 'stats:global'] },
  )();
}

export function getResolvedLast30d(): Promise<KpiSeries[]> {
  return unstable_cache(
    () => getResolvedLast30dRaw(),
    ['stats:resolved-last-30d'],
    { revalidate: 300, tags: ['stats', 'stats:global'] },
  )();
}

export function getPriorWindowTotal(): Promise<{ prior_30d_total: number }> {
  return unstable_cache(
    () => getPriorWindowTotalRaw(),
    ['stats:prior-window-total'],
    { revalidate: 300, tags: ['stats', 'stats:global'] },
  )();
}

export function getCreatedLast30dByOrgInGroup(
  groupId: string,
): Promise<PerOrgSeries[]> {
  return unstable_cache(
    () => getCreatedLast30dByOrgInGroupRaw(groupId),
    ['stats:group-per-org-30d', groupId],
    { revalidate: 300, tags: ['stats', `stats:group:${groupId}`] },
  )();
}

export function getMedianResponseTime(
  args: MedianResponseArgs,
): Promise<{ median_minutes: number | null }> {
  const scopeId = args.scope.type === 'global' ? 'global' : args.scope.id;
  const scopeTag =
    args.scope.type === 'global'
      ? 'stats:global'
      : `stats:${args.scope.type}:${args.scope.id}`;
  const userKey = args.userId ?? 'none';
  const userTag = args.userId ? `stats:user:${args.userId}` : null;
  const tags = ['stats', scopeTag, ...(userTag ? [userTag] : [])];
  return unstable_cache(
    () => getMedianResponseTimeRaw(args),
    ['stats:median-response', args.scope.type, scopeId, userKey],
    { revalidate: 300, tags },
  )();
}

// ─── getUserResponseMedianRaw (spec G3) ──────────────────────────────────────
//
// Pour chaque ticket qu'un user NE CRÉE PAS mais auquel il répond via
// commentaire, mesure (first user comment - ticket created_at). Médiane en
// minutes. Scope facultatif par org. Différent de `getMedianResponseTimeRaw`
// qui mesure le temps de résolution côté créateur ou scope global.
export async function getUserResponseMedianRaw(
  userId: string,
  orgId?: string,
): Promise<{ median_minutes: number | null }> {
  const orgClause = orgId ? sql`AND t.organization_id = ${orgId}` : sql``;

  try {
    const res = await db.execute(sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM diff) / 60.0
      ) AS median
      FROM (
        SELECT MIN(tc.created_at) - t.created_at AS diff
          FROM tickets t
          JOIN ticket_comments tc ON tc.ticket_id = t.id
         WHERE tc.author_id = ${userId}
           AND (t.creator_id IS NULL OR t.creator_id != ${userId})
           ${orgClause}
         GROUP BY t.id
      ) d
    `);
    const rows = rowsOf<{ median: unknown }>(res);
    const val = rows[0]?.median;
    if (val === null || val === undefined) return { median_minutes: null };
    const num = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(num)) return { median_minutes: null };
    return { median_minutes: num };
  } catch (err) {
    // Fallback JS median for engines without percentile_cont.
    const msg = err instanceof Error ? err.message : '';
    const isFunctionMissing =
      /percentile_cont|aggregate|function/i.test(msg) ||
      /does not exist/i.test(msg);
    if (!isFunctionMissing) throw err;

    const res = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (MIN(tc.created_at) - t.created_at)) / 60.0 AS diff_minutes
        FROM tickets t
        JOIN ticket_comments tc ON tc.ticket_id = t.id
       WHERE tc.author_id = ${userId}
         AND (t.creator_id IS NULL OR t.creator_id != ${userId})
         ${orgClause}
       GROUP BY t.id
    `);
    const diffs = rowsOf<{ diff_minutes: unknown }>(res)
      .map((r) =>
        typeof r.diff_minutes === 'number' ? r.diff_minutes : Number(r.diff_minutes),
      )
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (diffs.length === 0) return { median_minutes: null };
    const mid = Math.floor(diffs.length / 2);
    const median =
      diffs.length % 2 === 0 ? (diffs[mid - 1]! + diffs[mid]!) / 2 : diffs[mid]!;
    return { median_minutes: median };
  }
}
