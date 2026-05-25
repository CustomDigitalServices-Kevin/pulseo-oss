import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  AlertTriangle,
  Flame,
  Zap,
  Leaf,
  Bug,
  Sparkles,
  LifeBuoy,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelativeFr } from '@/lib/format/relative-time';
import { cn } from '@/lib/utils';

interface RecentTicket {
  id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  created_at: Date | string;
}

interface RecentTicketsGridProps {
  tickets: RecentTicket[];
  slug: string;
}

// Priority — dominante visuelle en haut de card (icône + libellé LISIBLE)
const PRIORITY_META: Record<
  string,
  {
    labelKey: string;
    Icon: typeof AlertTriangle;
    chipClass: string;
    dotClass: string;
    cardBorder: string;
    ribbon: string;
    glow: string;
    pulse: boolean;
  }
> = {
  critical: {
    labelKey: 'priorityCritical',
    Icon: AlertTriangle,
    chipClass: 'bg-rose-500/20 text-rose-200 border-rose-500/50 ring-1 ring-rose-500/30',
    dotClass: 'bg-rose-400',
    cardBorder: 'border-rose-500/30 hover:border-rose-500/50',
    ribbon: 'linear-gradient(90deg, rgba(244,63,94,1) 0%, rgba(244,63,94,0.4) 60%, transparent 100%)',
    glow: '0 0 32px -10px rgba(244,63,94,0.45), 0 0 0 1px rgba(244,63,94,0.15)',
    pulse: true,
  },
  high: {
    labelKey: 'priorityHigh',
    Icon: Flame,
    chipClass: 'bg-amber-500/20 text-amber-200 border-amber-500/50 ring-1 ring-amber-500/30',
    dotClass: 'bg-amber-400',
    cardBorder: 'border-amber-500/25 hover:border-amber-500/45',
    ribbon: 'linear-gradient(90deg, rgba(251,191,36,1) 0%, rgba(251,191,36,0.4) 60%, transparent 100%)',
    glow: '0 0 28px -12px rgba(251,191,36,0.35)',
    pulse: false,
  },
  medium: {
    labelKey: 'priorityMedium',
    Icon: Zap,
    chipClass: 'bg-sky-500/15 text-sky-200 border-sky-500/40',
    dotClass: 'bg-sky-400',
    cardBorder: 'border-white/10 hover:border-sky-500/35',
    ribbon: 'linear-gradient(90deg, rgba(56,189,248,0.9) 0%, rgba(56,189,248,0.3) 60%, transparent 100%)',
    glow: 'none',
    pulse: false,
  },
  low: {
    labelKey: 'priorityLow',
    Icon: Leaf,
    chipClass: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    dotClass: 'bg-zinc-400',
    cardBorder: 'border-white/10 hover:border-white/20',
    ribbon: 'linear-gradient(90deg, rgba(161,161,170,0.7) 0%, rgba(161,161,170,0.2) 60%, transparent 100%)',
    glow: 'none',
    pulse: false,
  },
};

const STATUS_META: Record<string, { labelKey: string; tone: string }> = {
  new: { labelKey: 'statusNew', tone: 'bg-sky-500/15 text-sky-200 border-sky-500/40' },
  in_progress: {
    labelKey: 'statusInProgress',
    tone: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  },
  waiting_client: {
    labelKey: 'statusWaitingClient',
    tone: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/40',
  },
  resolved: {
    labelKey: 'statusResolved',
    tone: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  },
  closed: {
    labelKey: 'statusClosed',
    tone: 'bg-zinc-500/12 text-zinc-400 border-zinc-500/30',
  },
};

// Category — chip explicite avec icône (renforce reconnaissance rapide)
const CATEGORY_META: Record<
  string,
  { labelKey: string; Icon: typeof Bug; chipClass: string }
> = {
  bug: {
    labelKey: 'categoryLabelBug',
    Icon: Bug,
    chipClass: 'bg-rose-500/15 text-rose-200 border-rose-500/40',
  },
  feature: {
    labelKey: 'categoryLabelFeature',
    Icon: Sparkles,
    chipClass: 'bg-violet-500/15 text-violet-200 border-violet-500/40',
  },
  support: {
    labelKey: 'categoryLabelSupport',
    Icon: LifeBuoy,
    chipClass: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40',
  },
  maintenance: {
    labelKey: 'categoryLabelMaintenance',
    Icon: Wrench,
    chipClass: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  },
};

/**
 * Nettoie un texte Markdown vers un aperçu plain-text court.
 * Utilisé uniquement pour le preview (la source de vérité reste SafeMarkdown).
 */
function stripMarkdown(src: string): string {
  return src
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Grille de cards tickets récents avec dominante priorité + catégorie.
 * Responsive 1/2/3 cols. Header card = 2 chips proéminents (priorité gauche,
 * catégorie droite) pour identification ultra-rapide.
 */
export async function RecentTicketsGrid({ tickets, slug }: RecentTicketsGridProps) {
  const t = await getTranslations('ticket');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {tickets.map((ticket) => {
        const meta = PRIORITY_META[ticket.priority] ?? PRIORITY_META.medium;
        const status = STATUS_META[ticket.status];
        const category = CATEGORY_META[ticket.category];
        const preview = stripMarkdown(ticket.description).slice(0, 160);
        const PrioIcon = meta.Icon;
        const CatIcon = category?.Icon ?? Bug;

        return (
          <Link
            key={ticket.id}
            href={`/clients/${slug}/tickets/${ticket.id}`}
            className={cn(
              'group relative overflow-hidden rounded-xl border bg-white/[0.03] backdrop-blur-xl transition-all duration-200',
              'hover:-translate-y-0.5 hover:bg-white/[0.06]',
              meta.cardBorder,
            )}
            style={
              meta.glow !== 'none'
                ? { boxShadow: meta.glow }
                : { boxShadow: '0 4px 16px -8px rgba(0,0,0,0.3)' }
            }
          >
            {/* Ribbon haut color-coded priorité — épaisseur 3px (marqué) */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-[3px]"
              style={{ background: meta.ribbon }}
            />

            <div className="relative p-4 pt-5 flex flex-col h-full min-h-[176px]">
              {/* Header : priorité chip gauche + catégorie chip droite (proéminents) */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[13px] font-semibold uppercase tracking-wider',
                    meta.chipClass,
                  )}
                >
                  {meta.pulse && (
                    <span className="relative flex w-1.5 h-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          'absolute inset-0 rounded-full animate-ping opacity-75',
                          meta.dotClass,
                        )}
                      />
                      <span className={cn('relative rounded-full w-1.5 h-1.5', meta.dotClass)} />
                    </span>
                  )}
                  <PrioIcon className="w-3 h-3" strokeWidth={2.5} />
                  {t(meta.labelKey)}
                </span>

                {category && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[13px] font-semibold',
                      category.chipClass,
                    )}
                  >
                    <CatIcon className="w-3 h-3" strokeWidth={2.5} />
                    {t(category.labelKey)}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-1.5 text-[13px] text-foreground-subtle/80 tabular-nums">
                  <span className="font-mono">#{ticket.number}</span>
                  <span>·</span>
                  <span>{formatRelativeFr(ticket.created_at)}</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>

              {/* Titre */}
              <h3 className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-foreground line-clamp-2">
                {ticket.title}
              </h3>

              {/* Preview description */}
              {preview && (
                <p className="mt-1.5 text-[14px] text-foreground-subtle leading-relaxed line-clamp-2">
                  {preview}
                </p>
              )}

              <div className="flex-1" />

              {/* Footer : uniquement le statut (catégorie déjà montée dans header) */}
              {status && (
                <div className="mt-3 flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={cn('h-5 text-[12px] px-1.5 font-medium', status.tone)}
                  >
                    {t(status.labelKey)}
                  </Badge>
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
