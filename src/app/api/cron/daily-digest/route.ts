import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { sendDailyDigest } from '@/lib/email/daily-digest';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint — sends the daily open-ticket digest to every super-admin.
 *
 * Security: a shared secret in `CRON_SECRET` env var must match the
 * `X-Cron-Secret` header. Compared in constant time to defeat timing-based
 * secret extraction over loopback (e.g. another container on the same VPS).
 *
 * Schedule: typically called by a crontab on the deploy host, Mon-Fri at
 * 08:00 local time. Example:
 *   CRON_TZ=Europe/Paris 0 8 * * 1-5  curl -sS -X POST \
 *     -H "X-Cron-Secret: $APP_CRON_SECRET" \
 *     https://your-domain.tld/api/cron/daily-digest
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.error('Cron daily-digest called but CRON_SECRET is not set');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }

  const provided = request.headers.get('x-cron-secret');
  if (!provided) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await sendDailyDigest();
    logger.info('Daily digest sent', {
      recipients: result.sentTo.length,
      orgs: result.orgCount,
      openTickets: result.totalOpenTickets,
      skipped: result.skippedReason,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error('Daily digest failed', { error: String(error) });
    return NextResponse.json({ error: 'Digest failed' }, { status: 500 });
  }
}
