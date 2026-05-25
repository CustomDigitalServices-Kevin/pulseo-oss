'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Ticket, ExternalLink, FileBox, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type TicketLinkRow = {
  linkId: string;
  ticketId: string;
  ticketNumber: number;
  ticketTitle: string;
  ticketStatus: string;
  ticketPriority: string;
  annotation: unknown;
  deliverableId: string | null;
  createdAt: Date | string;
};

function statusColor(status: string): string {
  if (/resolved|closed/i.test(status)) return 'text-emerald-500';
  if (/in_progress|processing/i.test(status)) return 'text-amber-500';
  if (/new|open/i.test(status)) return 'text-blue-500';
  return 'text-foreground-muted';
}

function priorityColor(priority: string): string {
  if (priority === 'urgent') return 'text-red-500';
  if (priority === 'high') return 'text-amber-500';
  if (priority === 'low') return 'text-foreground-muted';
  return 'text-foreground';
}

function annotationLabel(a: unknown, manualLabel: string): { icon: React.ReactNode; text: string } {
  if (typeof a === 'object' && a !== null && 'type' in a) {
    const ann = a as Record<string, unknown>;
    switch (ann.type) {
      case 'flow':
        return {
          icon: <Workflow className="w-3 h-3" />,
          text: `Flow · ${String(ann.node_id ?? '—')}`,
        };
      case 'pdf':
        return {
          icon: <FileBox className="w-3 h-3" />,
          text: `PDF page ${String(ann.page ?? '?')}`,
        };
      case 'image':
        return { icon: <FileBox className="w-3 h-3" />, text: 'Image · zone' };
      case 'msapp':
        return { icon: <FileBox className="w-3 h-3" />, text: `MSAPP · ${String(ann.screen_id ?? '')}` };
      case 'pbix':
        return { icon: <FileBox className="w-3 h-3" />, text: `PBIX · ${String(ann.page_id ?? '')}` };
      case 'solution':
        return {
          icon: <FileBox className="w-3 h-3" />,
          text: `Solution · ${String(ann.component_type ?? '')}`,
        };
    }
  }
  return { icon: <Ticket className="w-3 h-3" />, text: manualLabel };
}

export function TicketsLinksTab({
  slug,
  initialLinks,
}: {
  slug: string;
  initialLinks: TicketLinkRow[];
}) {
  const t = useTranslations('projects.ticketsLinks');
  if (initialLinks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-foreground-muted">
        <Ticket className="w-8 h-8 mx-auto mb-3 opacity-50" />
        <p>{t('empty')}</p>
        <p className="mt-2 text-xs text-foreground-subtle">
          {t('emptyHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-elevated/50 text-foreground-subtle text-[13px] uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t('tableNum')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('tableTitle')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('tableAnnotation')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('tablePriority')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('tableStatus')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('tableCreated')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('tableOpen')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {initialLinks.map((row) => {
            const { icon, text } = annotationLabel(row.annotation, t('annotationManual'));
            return (
              <tr key={row.linkId} className="hover:bg-elevated/30">
                <td className="px-3 py-2 tabular-nums text-foreground-muted">#{row.ticketNumber}</td>
                <td className="px-3 py-2">{row.ticketTitle}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[12px] inline-flex items-center gap-1">
                    {icon}
                    {text}
                  </Badge>
                </td>
                <td className={`px-3 py-2 text-xs capitalize ${priorityColor(row.ticketPriority)}`}>
                  {row.ticketPriority}
                </td>
                <td className={`px-3 py-2 text-xs capitalize ${statusColor(row.ticketStatus)}`}>
                  {row.ticketStatus.replace('_', ' ')}
                </td>
                <td className="px-3 py-2 text-foreground-muted text-xs tabular-nums">
                  {new Date(row.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/clients/${slug}/tickets/${row.ticketId}`}
                    className="inline-flex h-7 items-center justify-center rounded-md px-2 hover:bg-elevated/60 transition"
                    aria-label={t('openAria')}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
