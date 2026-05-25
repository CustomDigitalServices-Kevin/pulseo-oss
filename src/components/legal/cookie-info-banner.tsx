'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

const ACK_KEY = 'pulseo_cookie_ack';

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): boolean {
  return window.localStorage.getItem(ACK_KEY) === '1';
}

function getServerSnapshot(): boolean {
  return true; // côté serveur on considère acquitté → pas de hydration mismatch
}

export function CookieInfoBanner() {
  const t = useTranslations('legal.cookieBanner');
  const acknowledged = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissedLocal, setDismissedLocal] = useState(false);

  const dismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACK_KEY, '1');
    }
    setDismissedLocal(true);
  }, []);

  if (acknowledged || dismissedLocal) return null;

  return (
    <div
      role="region"
      aria-label={t('regionAria')}
      className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:max-w-md z-50 rounded-lg border border-border bg-elevated/95 backdrop-blur shadow-premium-md p-4 text-[13px] text-foreground-muted"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 leading-relaxed">
          <p className="font-medium text-foreground mb-1">{t('title')}</p>
          <p>
            {t('body')}{' '}
            <Link
              href="/cookies"
              className="text-primary underline-offset-2 underline decoration-primary/40 hover:decoration-primary"
            >
              {t('learnMore')}
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('dismissAria')}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-canvas/60 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="mt-3 w-full h-9 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
      >
        {t('acknowledge')}
      </button>
    </div>
  );
}
