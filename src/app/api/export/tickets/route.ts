import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { requireEffectiveRole } from '@/lib/auth/require-role';
import { db } from '@/lib/db';
import { tickets } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import {
  TicketStatusLabels,
  TicketPriorityLabels,
  TicketCategoryLabels,
  type TicketStatusType,
  type TicketPriorityType,
  type TicketCategoryType,
} from '@/types';
import { logger } from '@/lib/logger';

const EXPORT_MAX_ROWS = 10_000;

/**
 * CSV/XLSX formula-injection guard. Excel/LibreOffice interpret cells
 * starting with =, +, -, @, \t or \r as formulas. Prepending a single
 * quote neutralises the formula while keeping the visible content
 * unchanged for the reader (cf P2-1 audit).
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

    const ticketList = await db
      .select()
      .from(tickets)
      .where(eq(tickets.organization_id, orgId))
      .orderBy(desc(tickets.created_at))
      .limit(EXPORT_MAX_ROWS + 1);

    const truncated = ticketList.length > EXPORT_MAX_ROWS;
    const rows = truncated ? ticketList.slice(0, EXPORT_MAX_ROWS) : ticketList;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pulseo';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Tickets');

    sheet.columns = [
      { header: '#', key: 'number', width: 8 },
      { header: 'Titre', key: 'title', width: 40 },
      { header: 'Statut', key: 'status', width: 15 },
      { header: 'Priorite', key: 'priority', width: 12 },
      { header: 'Categorie', key: 'category', width: 20 },
      { header: 'Date creation', key: 'created_at', width: 18 },
      { header: 'Date fermeture', key: 'closed_at', width: 18 },
      { header: 'Temps passe (h)', key: 'time_spent', width: 15 },
    ];

    // Style header
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const t of rows) {
      sheet.addRow({
        number: t.number,
        title: safeXlsxCell(t.title),
        status: safeXlsxCell(
          TicketStatusLabels[t.status as TicketStatusType] || t.status,
        ),
        priority: safeXlsxCell(
          TicketPriorityLabels[t.priority as TicketPriorityType] || t.priority,
        ),
        category: safeXlsxCell(
          TicketCategoryLabels[t.category as TicketCategoryType] || t.category,
        ),
        created_at: new Date(t.created_at).toLocaleDateString('fr-FR'),
        closed_at: t.closed_at ? new Date(t.closed_at).toLocaleDateString('fr-FR') : '',
        time_spent: t.time_spent_minutes ? (t.time_spent_minutes / 60).toFixed(1) : '0',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `tickets-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
    logger.error('Export tickets failed', { error: String(error) });
    return NextResponse.json(
      { error: 'Erreur lors de l\'export' },
      { status: 500 }
    );
  }
}
