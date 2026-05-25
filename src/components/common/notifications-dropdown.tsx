'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  description?: string;
  time: string;
  /** ISO timestamp — used by the client to compute "unread" state. */
  createdAt: string;
}

interface NotificationsDropdownProps {
  notifications?: Notification[];
}

const LAST_SEEN_KEY = 'pulseo.notifications.lastSeen';
const LAST_SEEN_EVENT = 'pulseo:notif-last-seen-changed';

function subscribeLastSeen(listener: () => void): () => void {
  window.addEventListener('storage', listener);
  window.addEventListener(LAST_SEEN_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(LAST_SEEN_EVENT, listener);
  };
}

function getLastSeenSnapshot(): number {
  try {
    return Number(window.localStorage.getItem(LAST_SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Notifications dropdown shown in the header. Reads its items from the
 * caller (server-rendered from the audit log) and tracks a "last seen"
 * timestamp in localStorage so items newer than that are marked unread.
 * "Tout marquer comme lu" updates the stored timestamp.
 */
export function NotificationsDropdown({
  notifications = [],
}: NotificationsDropdownProps) {
  const lastSeen = useSyncExternalStore(
    subscribeLastSeen,
    getLastSeenSnapshot,
    getServerSnapshot
  );

  const enriched = useMemo(
    () =>
      notifications.map((n) => ({
        ...n,
        unread: new Date(n.createdAt).getTime() > lastSeen,
      })),
    [notifications, lastSeen]
  );
  const unreadCount = enriched.filter((n) => n.unread).length;

  const markAllRead = () => {
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      window.dispatchEvent(new Event(LAST_SEEN_EVENT));
    } catch {
      /* localStorage unavailable (private mode) */
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'relative inline-flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
        )}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-card" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {enriched.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune notification pour l&apos;instant
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {enriched.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 hover:bg-muted/50 transition-colors ${
                    n.unread ? 'bg-primary/[0.02]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {n.unread && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.description}
                        </p>
                      )}
                      <p className="text-[13px] text-muted-foreground/70 mt-1">
                        {n.time}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="w-full text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Tout marquer comme lu
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
