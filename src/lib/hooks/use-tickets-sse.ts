'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Subscribe to the Server-Sent Events stream of ticket updates for an
 * organization and trigger a server-side refresh whenever a ticket is
 * created or modified. Falls back silently when EventSource is unavailable.
 *
 * The hook is a pure side-effect: render output does not change. The
 * refreshed server component fetches the latest data via its existing
 * Drizzle query — no client-side cache to keep in sync.
 */
export function useTicketsSSE(orgId: string | undefined): void {
  const router = useRouter();

  useEffect(() => {
    if (!orgId) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    const source = new EventSource(`/api/sse/tickets?org_id=${encodeURIComponent(orgId)}`);

    source.addEventListener('ticket', () => {
      router.refresh();
    });

    // Do not auto-reconnect on server errors (EventSource reconnects itself
    // on transport-level errors; `onerror` fires and close() prevents runaway
    // reconnect when the server is unreachable).
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) return;
    });

    return () => source.close();
  }, [orgId, router]);
}
