import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tickets } from '@/lib/db/schema';
import { eq, and, gt, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { canAccessOrg } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Server-Sent Events stream for real-time ticket updates.
 *
 * Client subscribes via EventSource('/api/sse/tickets?org_id=...').
 * Server polls the DB every 5s and pushes any tickets created or updated
 * since the last poll. Heartbeats are sent every 30s to keep the connection
 * alive through proxies.
 *
 * Limitations:
 *   - One DB poll per connection (not great at scale; OK for small teams)
 *   - No reconnection state (client uses last_event_id if needed)
 *
 * Production note: behind Nginx, set proxy_buffering off and proxy_read_timeout 1d.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get('org_id');
  if (!orgId) {
    return new Response('Missing org_id', { status: 400 });
  }

  // Verify access (direct membership, group manager, or team grant).
  if (!(await canAccessOrg(session.user.id, orgId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const log = logger.child({ sse: 'tickets', orgId, userId: session.user.id });
  log.info('SSE connection opened');

  const encoder = new TextEncoder();
  let lastChecked = new Date();
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Initial event: connection acknowledged.
      controller.enqueue(
        encoder.encode(`event: open\ndata: ${JSON.stringify({ ok: true })}\n\n`)
      );

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch (err) {
          log.warn('SSE write failed', { error: String(err) });
        }
      };

      const poll = async () => {
        try {
          const updated = await db
            .select({
              id: tickets.id,
              number: tickets.number,
              title: tickets.title,
              status: tickets.status,
              priority: tickets.priority,
              updated_at: tickets.updated_at,
            })
            .from(tickets)
            .where(
              and(
                eq(tickets.organization_id, orgId),
                gt(tickets.updated_at, lastChecked)
              )
            )
            .orderBy(sql`${tickets.updated_at} ASC`)
            .limit(50);

          if (updated.length > 0) {
            send('ticket', { items: updated });
            const newest = updated[updated.length - 1].updated_at;
            if (newest) lastChecked = newest;
          }
        } catch (err) {
          log.error('SSE poll failed', { error: String(err) });
        }
      };

      pollHandle = setInterval(() => void poll(), POLL_INTERVAL_MS);
      heartbeatHandle = setInterval(() => send('heartbeat', { t: Date.now() }), HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener('abort', () => {
        closed = true;
        if (pollHandle) clearInterval(pollHandle);
        if (heartbeatHandle) clearInterval(heartbeatHandle);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        log.info('SSE connection closed');
      });
    },
    cancel() {
      closed = true;
      if (pollHandle) clearInterval(pollHandle);
      if (heartbeatHandle) clearInterval(heartbeatHandle);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
