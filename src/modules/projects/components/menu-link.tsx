'use client';
import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Lien "Projets" injecté dans la Zone 2 contextuelle de `sidebar-tree.tsx`.
 * Le style matche `NavLink` interne de la sidebar (px-2 py-1.5, text-[15px],
 * palette foreground-muted/foreground) pour rester visuellement cohérent avec
 * Dashboard / Tickets / Documents / Contrats.
 */
export function ProjectsMenuItem({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname() ?? '';
  const active = pathname.startsWith(`/clients/${orgSlug}/projects`);
  const t = useTranslations('nav');
  return (
    <Link
      href={`/clients/${orgSlug}/projects`}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md text-[15px] transition-colors',
        active
          ? 'bg-elevated text-foreground font-medium'
          : 'text-foreground-muted hover:bg-elevated/60 hover:text-foreground',
      )}
    >
      <FolderKanban className="w-3.5 h-3.5 shrink-0 text-foreground-subtle" />
      <span className="truncate">{t('projects')}</span>
    </Link>
  );
}
