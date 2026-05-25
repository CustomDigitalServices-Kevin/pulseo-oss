import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { requireEffectiveRole } from '@/lib/auth/require-role';
import { db } from '@/lib/db';
import { contracts } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ContractStatusLabels, type ContractStatusType } from '@/types';
import { logger } from '@/lib/logger';

const EXPORT_MAX_ROWS = 10_000;

/**
 * CSV/XLSX formula-injection guard — same behaviour as the helper in
 * src/app/api/export/tickets/route.ts (cf P2-1 audit).
 */
function safeXlsxCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const orgIdRaw = request.nextUrl.searchParams.get('org_id');

    const orgIdParse = z.string().uuid().safeParse(orgIdRaw);
    if (!orgIdParse.success) {
      return NextResponse.json({ error: 'org_id invalide' }, { status: 400 });
    }
    const orgId = orgIdParse.data;

    await requireEffectiveRole(session.user.id, orgId, 'gestionnaire');

    const contractList = await db
      .select()
      .from(contracts)
      .where(eq(contracts.organization_id, orgId))
      .orderBy(desc(contracts.created_at))
      .limit(EXPORT_MAX_ROWS + 1);

    const truncated = contractList.length > EXPORT_MAX_ROWS;
    const rows = truncated ? contractList.slice(0, EXPORT_MAX_ROWS) : contractList;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pulseo';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Contrats');

    sheet.columns = [
      { header: 'Nom', key: 'name', width: 30 },
      { header: 'Statut', key: 'status', width: 15 },
      { header: 'Quota (h)', key: 'quota', width: 12 },
      { header: 'Consomme (h)', key: 'consumed', width: 14 },
      { header: 'Restant (h)', key: 'remaining', width: 14 },
      { header: 'Taux horaire (EUR)', key: 'rate', width: 18 },
      { header: 'Debut', key: 'start_date', width: 15 },
      { header: 'Fin', key: 'end_date', width: 15 },
    ];

    // Style header
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const c of rows) {
      const quota = parseFloat(c.quota_hours);
      const consumed = parseFloat(c.consumed_hours);

      sheet.addRow({
        name: safeXlsxCell(c.name),
        status: safeXlsxCell(
          ContractStatusLabels[c.status as ContractStatusType] || c.status,
        ),
        quota: quota.toFixed(1),
        consumed: consumed.toFixed(1),
        remaining: Math.max(quota - consumed, 0).toFixed(1),
        rate: parseFloat(c.rate_per_hour).toFixed(2),
        start_date: new Date(c.start_date).toLocaleDateString('fr-FR'),
        end_date: new Date(c.end_date).toLocaleDateString('fr-FR'),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `contrats-${new Date().toISOString().slice(0, 10)}.xlsx`;

    const headers: Record<string, string> = {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    };
    if (truncated) {
      headers['X-Export-Truncated'] = 'true';
      headers['X-Export-Max-Rows'] = String(EXPORT_MAX_ROWS);
    }

    return new NextResponse(buffer, { headers });
  } catch (error) {
    logger.error('Export contracts failed', { error: String(error) });
    return NextResponse.json(
      { error: 'Erreur lors de l\'export' },
      { status: 500 }
    );
  }
}
