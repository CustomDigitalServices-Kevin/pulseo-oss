import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSession } from '@/lib/auth/session';
import { canAccessOrg } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// Resolve storage base once at module init to avoid Turbopack NFT
// tracing the whole filesystem when path.resolve runs inside the handler.
const STORAGE_BASE = path.resolve(process.env.STORAGE_PATH || './storage');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path: pathArray } = await params;
    const [orgId, , ticketId, fileKey] = pathArray;

    if (!orgId || !ticketId || !fileKey) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    if (!(await canAccessOrg(session.user.id, orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const attachment = await db.query.ticket_attachments.findFirst({
      where: (a, { eq }) => eq(a.file_key, fileKey),
      with: {
        ticket: { columns: { organization_id: true } },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Verify ticket belongs to the org from URL
    if (attachment.ticket.organization_id !== orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const filePath = path.join(STORAGE_BASE, orgId, 'tickets', ticketId, fileKey);

    if (!filePath.startsWith(STORAGE_BASE + path.sep)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const buffer = await readFile(filePath);

    const rawFilename = attachment.filename || attachment.file_key;
    // ASCII-safe fallback for legacy clients; RFC 5987 for full Unicode.
    const asciiSafe = rawFilename
      .replace(/["\r\n]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_');
    const encoded = encodeURIComponent(rawFilename);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.mime_type,
        'Content-Disposition': `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encoded}`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error('Download file failed', { error: String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
