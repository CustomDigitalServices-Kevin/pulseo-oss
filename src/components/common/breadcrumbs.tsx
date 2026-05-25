'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Map of path segments to i18n keys in the `common2` namespace.
 * Dynamic segments (UUIDs, slugs) are humanized to the localized "Details".
 */
const SEGMENT_KEYS: Record<string, string> = {
  admin: 'breadcrumbAdmin',
  clients: 'breadcrumbClients',
  dashboard: 'breadcrumbDashboard',
  tickets: 'breadcrumbTickets',
  contracts: 'breadcrumbContracts',
  documents: 'breadcrumbDocuments',
  audit: 'breadcrumbAudit',
  'magic-links': 'breadcrumbMagicLinks',
  new: 'breadcrumbNew',
  invite: 'breadcrumbInvite',
  join: 'breadcrumbJoin',
};

interface BreadcrumbsProps {
  /** Optional override for the rightmost label (e.g. ticket title). */
  currentLabel?: string;
  className?: string;
}

export function Breadcrumbs({ currentLabel, className }: BreadcrumbsProps) {
  const pathname = usePathname();
  const t = useTranslations('common2');
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const humanize = (segment: string): string => {
    if (SEGMENT_KEYS[segment]) return t(SEGMENT_KEYS[segment]);
    // UUIDs and other long ids → localized "Details"
    if (/^[0-9a-f-]{8,}$/i.test(segment)) return t('breadcrumbDetail');
    // Slugs and short identifiers → keep capitalized
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  };

  const crumbs = segments.map((segment, idx) => {
    const href = '/' + segments.slice(0, idx + 1).join('/');
    const isLast = idx === segments.length - 1;
    const label = isLast && currentLabel ? currentLabel : humanize(segment);
    return { href, label, isLast };
  });

  return (
    <nav
      aria-label={t('breadcrumbAriaLabel')}
      className={cn(
        'flex items-center gap-1.5 text-xs text-muted-foreground',
        className
      )}
    >
      <Link
        href="/"
        className="flex items-center hover:text-foreground transition-colors"
        aria-label={t('breadcrumbHomeAria')}
      >
        <Home className="w-3.5 h-3.5" />
      </Link>
      {crumbs.map((crumb) => (
        <div key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground/80 truncate max-w-[200px]">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors truncate max-w-[150px]"
            >
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
