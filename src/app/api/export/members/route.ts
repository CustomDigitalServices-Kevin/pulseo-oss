import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, isUserAdmin } from '@/lib/auth/session';
import { canAccessOrg } from '@/lib/auth/permissions';
import { getEffectiveRole } from '@/lib/auth/effective-role';
import { listOrgMembers } from '@/lib/members/query';
import type { MemberRow, RoleSource } from '@/components/members/members-table';
import { logger } from '@/lib/logger';

const uuid = z.string().uuid();

const ROLE_RANK: Record<'viewer' | 'gestionnaire' | 'admin', number> = {
  viewer: 1,
  gestionnaire: 2,
  admin: 3,
};

const STATUS_LABELS: Record<MemberRow['status'], string> = {
  active: 'Actif',
  inactive: 'Inactif',
  invited: 'Invité',
  external_contact: 'Externe',
};

const SOURCE_KIND_LABELS: Record<MemberRow['source_kind'], string> = {
  member: 'membre',
  invite: 'invitation',
  responsible: 'responsable_externe',
  org_lead: 'responsable_legacy',
};

const ROLE_LABELS: Record<MemberRow['effective_role'], string> = {
  admin: 'Admin',
  gestionnaire: 'Gestionnaire',
  viewer: 'Lecteur',
};

function roleSourceToCsv(source: RoleSource): { kind: string; label: string } {
  switch (source.kind) {
    case 'direct':
      return { kind: 'direct', label: '' };
    case 'superadmin':
      return { kind: 'superadmin', label: '' };
    case 'group':
      return { kind: 'group', label: source.name };
    case 'team':
      return { kind: 'team', label: source.name };
  }
}

export function escapeCsvCell(value: unknown): string {
  const str =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  // CSV-injection guard: prepend a single quote to any cell whose first
  // character is interpreted as a formula by Excel/LibreOffice. Without
  // this, an attacker-controlled member name like "=cmd|'/c calc'!A0"
  // would execute when the spreadsheet is opened (cf P2-1 audit).
  const FORMULA_PREFIX = /^[=+\-@\t\r]/;
  const guarded = FORMULA_PREFIX.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function rowsToCsv(rows: MemberRow[]): string {
  const headers = [
    'member_id',
    'source_kind',
    'email',
    'name',
    'effective_role',
    'role_source_kind',
    'role_source_label',
    'status',
    'inactive_days',
    'date_added',
    'last_activity_at',
    'tickets_created_30d',
    'tickets_commented_30d',
    'median_response_minutes',
    'can_edit_role',
    'can_remove',
  ];

  const lines: string[] = [headers.join(',')];
  for (const r of rows) {
    const source = roleSourceToCsv(r.role_source);
    const cells = [
      r.id,
      SOURCE_KIND_LABELS[r.source_kind],
      r.email,
      r.name ?? '',
      ROLE_LABELS[r.effective_role],
      source.kind,
      source.label,
      STATUS_LABELS[r.status],
      r.inactive_days ?? '',
      r.date_added,
      r.last_activity_at ?? '',
      r.tickets_created_30d,
      r.tickets_commented_30d,
      r.median_response_minutes ?? '',
      r.can_edit_role ? 'yes' : 'no',
      r.can_remove ? 'yes' : 'no',
    ];
    lines.push(cells.map(escapeCsvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const orgIdRaw = request.nextUrl.searchParams.get('org_id');
    const parsed = uuid.safeParse(orgIdRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'org_id invalide' }, { status: 400 });
    }
    const orgId = parsed.data;

    const isSuperadmin = await isUserAdmin(session.user.id);
    if (!isSuperadmin) {
      const access = await canAccessOrg(session.user.id, orgId);
      if (!access) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
      }
      // Require at least gestionnaire role to export member data.
      const role = await getEffectiveRole(session.user.id, orgId);
      if (!role || ROLE_RANK[role] < ROLE_RANK.gestionnaire) {
        return NextResponse.json({ error: 'Rôle insuffisant' }, { status: 403 });
      }
    }

    const rows = await listOrgMembers(orgId, {
      userId: session.user.id,
      isSuperadmin,
    });
    const csv = rowsToCsv(rows);

    logger.info('[EXPORT] members', { org: orgId, rows: rows.length });

    const filename = `members-${orgId.slice(0, 8)}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    logger.error('[EXPORT] members failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Erreur export' }, { status: 500 });
  }
}
