'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { ProjProject } from '@/modules/projects/schema/tables';

const STATUS_COLORS: Record<string, string> = {
  chiffrage: 'bg-blue-500/10 text-blue-500',
  en_cours: 'bg-amber-500/10 text-amber-500',
  en_attente: 'bg-zinc-500/10 text-zinc-400',
  recette: 'bg-purple-500/10 text-purple-400',
  valide: 'bg-emerald-500/10 text-emerald-400',
  archive: 'bg-zinc-700/20 text-zinc-500',
};

export function ProjectsListView({
  projects, orgSlug,
}: { projects: ProjProject[]; orgSlug: string }) {
  const t = useTranslations('projects.list');
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        {t('empty')}{' '}
        <Link className="underline" href={`/clients/${orgSlug}/projects/new`}>
          {t('createFirst')}
        </Link>
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('tableName')}</TableHead>
          <TableHead>{t('tableType')}</TableHead>
          <TableHead>{t('tableStatus')}</TableHead>
          <TableHead>{t('tableTarget')}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{p.name}</TableCell>
            <TableCell className="capitalize">{p.type}</TableCell>
            <TableCell>
              <Badge className={STATUS_COLORS[p.status]}>{p.status.replace('_', ' ')}</Badge>
            </TableCell>
            <TableCell>{p.target_date ? new Date(p.target_date).toLocaleDateString('fr-FR') : '—'}</TableCell>
            <TableCell className="text-right">
              <Link
                href={`/clients/${orgSlug}/projects/${p.id}`}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                {t('open')}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
