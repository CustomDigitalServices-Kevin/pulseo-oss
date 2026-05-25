import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import {
  projDeliverables,
  projProjects,
  projGithubTokens,
} from '@/modules/projects/schema/tables';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { decryptToken } from '@/modules/projects/lib/crypto';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { logger } from '@/lib/logger';

/**
 * Charge un deliverable kind=github_repo avec IDOR guard + extract owner/repo.
 */
async function loadGithubDeliverable(deliverableId: string, userId: string) {
  const [row] = await db
    .select({
      id: projDeliverables.id,
      project_id: projDeliverables.project_id,
      kind: projDeliverables.kind,
      deleted_at: projDeliverables.deleted_at,
      github_url: projDeliverables.github_url,
      github_branch: projDeliverables.github_branch,
      organization_id: projProjects.organization_id,
    })
    .from(projDeliverables)
    .innerJoin(projProjects, eq(projProjects.id, projDeliverables.project_id))
    .where(eq(projDeliverables.id, deliverableId));
  if (!row) return { error: 'not_found' as const };
  if (row.deleted_at) return { error: 'not_found' as const };
  if (row.kind !== 'github_repo' || !row.github_url) return { error: 'not_github' as const };

  const ok = await hasProjectsAccess(userId, row.organization_id);
  if (!ok) return { error: 'forbidden' as const };

  const m = row.github_url.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git|\/)?$/);
  if (!m) return { error: 'invalid_github_url' as const };

  return {
    row,
    owner: m[1],
    repo: m[2],
  };
}

/**
 * Lookup + decrypt du token GitHub d'une org. Retourne null si aucun
 * token ou decrypt fail (le caller peut tenter un call public GitHub pour
 * les repos open source).
 */
async function lookupGithubToken(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      encrypted_token: projGithubTokens.encrypted_token,
      key_version: projGithubTokens.key_version,
    })
    .from(projGithubTokens)
    .where(eq(projGithubTokens.organization_id, organizationId));
  if (!row) return null;
  const r = decryptToken(row.encrypted_token, row.key_version);
  if (!r.ok) return null;
  return r.plaintext;
}

/**
 * GET /api/projects/github/metadata?deliverableId=<uuid>
 *
 * Fetch les métadonnées publiques ou privées (selon token org) :
 * - name, description, stars, lastCommit, defaultBranch, html_url
 */
export async function handleGithubMetadata(req: NextRequest): Promise<NextResponse> {
  if (!isProjectsEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await getSessionInfo();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(req.url);
  const deliverableId = url.searchParams.get('deliverableId');
  if (!deliverableId) return NextResponse.json({ error: 'missing_deliverable_id' }, { status: 400 });

  const loaded = await loadGithubDeliverable(deliverableId, session.userId);
  if ('error' in loaded) {
    const code = loaded.error;
    const status = code === 'forbidden' ? 403 : 404;
    return NextResponse.json({ error: code }, { status });
  }
  const { row, owner, repo } = loaded;

  const token = await lookupGithubToken(row.organization_id);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pulseo-projects-module',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      // 10s timeout via AbortSignal
      signal: AbortSignal.timeout(10_000),
    });
    if (apiRes.status === 404) {
      return NextResponse.json({ error: 'repo_not_found_or_private_no_token' }, { status: 404 });
    }
    if (apiRes.status === 401 || apiRes.status === 403) {
      return NextResponse.json({ error: 'github_api_auth_failed', httpStatus: apiRes.status }, { status: 502 });
    }
    if (!apiRes.ok) {
      return NextResponse.json({ error: 'github_api_error', httpStatus: apiRes.status }, { status: 502 });
    }
    const data = (await apiRes.json()) as Record<string, unknown>;

    // Normalise uniquement les champs utiles — évite leak des clés GitHub internes
    return NextResponse.json({
      name: data.name ?? null,
      fullName: data.full_name ?? null,
      description: data.description ?? null,
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      defaultBranch: data.default_branch ?? 'main',
      htmlUrl: data.html_url ?? null,
      pushedAt: data.pushed_at ?? null,
      currentBranch: row.github_branch,
    });
  } catch (err) {
    logger.error('[projects/api/github/metadata] failed', { err: String(err) });
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}

/**
 * GET /api/projects/github/download?deliverableId=<uuid>
 *
 * Proxy un download ZIP `https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}`.
 * Streaming — pas de buffer côté serveur. Audit log deliverable_downloaded.
 */
export async function handleGithubDownload(req: NextRequest): Promise<NextResponse> {
  if (!isProjectsEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await getSessionInfo();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(req.url);
  const deliverableId = url.searchParams.get('deliverableId');
  if (!deliverableId) return NextResponse.json({ error: 'missing_deliverable_id' }, { status: 400 });

  const loaded = await loadGithubDeliverable(deliverableId, session.userId);
  if ('error' in loaded) {
    const code = loaded.error;
    const status = code === 'forbidden' ? 403 : 404;
    return NextResponse.json({ error: code }, { status });
  }
  const { row, owner, repo } = loaded;
  const branch = row.github_branch || 'main';

  const token = await lookupGithubToken(row.organization_id);

  // Preuve IDOR + audit log même en cas de download
  await writeProjectAuditLog({
    organizationId: row.organization_id,
    actorId: session.userId,
    eventType: 'deliverable_downloaded',
    entityType: 'deliverable',
    entityId: row.id,
    metadata: { kind: 'github_repo', owner, repo, branch },
  });

  const headers: Record<string, string> = {
    'User-Agent': 'pulseo-projects-module',
    Accept: 'application/zip',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const ghUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(branch)}`;

  try {
    const ghRes = await fetch(ghUrl, {
      headers,
      signal: AbortSignal.timeout(60_000),
      // NOTE: GitHub peut retourner 302 vers un s3-bucket signed URL, fetch suit les redirects par défaut
    });

    if (ghRes.status === 404) {
      return NextResponse.json({ error: 'branch_not_found' }, { status: 404 });
    }
    if (!ghRes.ok) {
      return NextResponse.json({ error: 'github_download_failed', httpStatus: ghRes.status }, { status: 502 });
    }

    const size = ghRes.headers.get('content-length') ?? '';
    const filename = `${owner}-${repo}-${branch.replace(/[^a-zA-Z0-9_.-]/g, '_')}.zip`;

    return new NextResponse(ghRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        ...(size ? { 'Content-Length': size } : {}),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    logger.error('[projects/api/github/download] fetch failed', { err: String(err) });
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}

// Silence unused warning on `and` import that's used elsewhere
void and;
