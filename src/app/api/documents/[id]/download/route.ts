import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSession } from '@/lib/auth/session';
import { getMemberRole } from '@/lib/auth/require-role';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const doc = await db.query.documents.findFirst({
      where: (d, { eq }) => eq(d.id, id),
    });

    if (!doc || !doc.file_key) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Documents are gestionnaire/admin only (same gate as the UI page).
    // Viewers may have access to the org but they must not download any
    // invoice / quote / report. getMemberRole consolide les 3 sources
    // (direct, group manager, team grant) + court-circuit superadmin.
    const memberRole = await getMemberRole(session.user.id, doc.organization_id);
    if (!memberRole || (memberRole.role !== 'gestionnaire' && memberRole.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const storagePath = process.env.STORAGE_PATH || './storage';
    const resolvedStorage = path.resolve(storagePath);
    const filePath = path.resolve(storagePath, doc.organization_id, 'documents', doc.file_key);

    if (!filePath.startsWith(resolvedStorage + path.sep)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const buffer = await readFile(filePath);

    const rawFilename = doc.filename || doc.file_key;
    // ASCII-safe fallback for legacy clients; RFC 5987 for full Unicode.
    const asciiSafe = rawFilename
      .replace(/["\r\n]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_');
    const encoded = encodeURIComponent(rawFilename);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': doc.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encoded}`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error('Download document failed', { error: String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
