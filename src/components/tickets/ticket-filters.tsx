'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketFiltersProps {
  slug: string;
}

/**
 * Barre de filtres tickets — pattern UI moderne 2026 (faceted search).
 * - Recherche textuelle debouncée (param URL `q`) ciblant le titre
 * - 3 filtres à facettes (statut / priorité / catégorie)
 * - Chips dismissibles color-coded pour chaque filtre actif (visual feedback immédiat)
 * - Card glassmorphic (bg semi-transparent + backdrop-blur) pour laisser passer
 *   le fond animé du portal layout
 *
 * Références UX :
 * - Linear filters (chips removables) — linear.app/docs/filters
 * - Dark glassmorphism 2026 — medium.com/@developer_89726
 * - Filter UI 2026 best practices — bricxlabs.com/blogs/universal-search-and-filters-ui
 */

const STATUS_META: Record<string, { labelKey: string; tone: string; dot: string }> = {
  new: { labelKey: 'filtersStatusNew', tone: 'text-sky-300 bg-sky-500/12 border-sky-500/30', dot: 'bg-sky-400' },
  in_progress: { labelKey: 'filtersStatusInProgress', tone: 'text-amber-300 bg-amber-500/12 border-amber-500/30', dot: 'bg-amber-400' },
  waiting_client: { labelKey: 'filtersStatusWaitingClient', tone: 'text-fuchsia-300 bg-fuchsia-500/12 border-fuchsia-500/30', dot: 'bg-fuchsia-400' },
  resolved: { labelKey: 'filtersStatusResolved', tone: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30', dot: 'bg-emerald-400' },
  closed: { labelKey: 'filtersStatusClosed', tone: 'text-zinc-300 bg-zinc-500/12 border-zinc-500/30', dot: 'bg-zinc-400' },
};

const PRIORITY_META: Record<string, { labelKey: string; tone: string; dot: string }> = {
  low: { labelKey: 'filtersPriorityLow', tone: 'text-zinc-300 bg-zinc-500/12 border-zinc-500/30', dot: 'bg-zinc-400' },
  medium: { labelKey: 'filtersPriorityMedium', tone: 'text-sky-300 bg-sky-500/12 border-sky-500/30', dot: 'bg-sky-400' },
  high: { labelKey: 'filtersPriorityHigh', tone: 'text-amber-300 bg-amber-500/12 border-amber-500/30', dot: 'bg-amber-400' },
  critical: { labelKey: 'filtersPriorityCritical', tone: 'text-rose-300 bg-rose-500/12 border-rose-500/30', dot: 'bg-rose-400' },
};

const CATEGORY_META: Record<string, { labelKey: string; tone: string; dot: string }> = {
  bug: { labelKey: 'filtersCategoryBug', tone: 'text-rose-300 bg-rose-500/12 border-rose-500/30', dot: 'bg-rose-400' },
  feature: { labelKey: 'filtersCategoryFeature', tone: 'text-violet-300 bg-violet-500/12 border-violet-500/30', dot: 'bg-violet-400' },
  support: { labelKey: 'filtersCategorySupport', tone: 'text-cyan-300 bg-cyan-500/12 border-cyan-500/30', dot: 'bg-cyan-400' },
  maintenance: { labelKey: 'filtersCategoryMaintenance', tone: 'text-zinc-300 bg-zinc-500/12 border-zinc-500/30', dot: 'bg-zinc-400' },
};

export function TicketFilters({ slug }: TicketFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('ticket');

  const status = searchParams.get('status') || 'all';
  const priority = searchParams.get('priority') || 'all';
  const category = searchParams.get('category') || 'all';
  const qParam = searchParams.get('q') || '';

  const [searchValue, setSearchValue] = useState(qParam);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === '' || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete('page');
      router.push(`/clients/${slug}/tickets?${params.toString()}`);
    },
    [router, searchParams, slug],
  );

  // Debounce search input (350ms) pour éviter une requête par keystroke.
  useEffect(() => {
    if (searchValue === qParam) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParam('q', searchValue.trim() || null);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue, qParam, updateParam]);

  // Synchroniser l'input si l'URL change via back/forward browser.
  useEffect(() => {
    setSearchValue(qParam);
  }, [qParam]);

  const handleReset = () => {
    setSearchValue('');
    router.push(`/clients/${slug}/tickets`);
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; value: string; label: string; tone: string; dot: string }> = [];
    if (status !== 'all' && STATUS_META[status]) {
      chips.push({ key: 'status', value: status, tone: STATUS_META[status].tone, dot: STATUS_META[status].dot, label: t(STATUS_META[status].labelKey) });
    }
    if (priority !== 'all' && PRIORITY_META[priority]) {
      chips.push({ key: 'priority', value: priority, tone: PRIORITY_META[priority].tone, dot: PRIORITY_META[priority].dot, label: t(PRIORITY_META[priority].labelKey) });
    }
    if (category !== 'all' && CATEGORY_META[category]) {
      chips.push({ key: 'category', value: category, tone: CATEGORY_META[category].tone, dot: CATEGORY_META[category].dot, label: t(CATEGORY_META[category].labelKey) });
    }
    return chips;
  }, [status, priority, category, t]);

  const activeCount = activeChips.length + (qParam ? 1 : 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]">
      {/* Ligne principale : recherche + selects + reset */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 lg:p-4">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle pointer-events-none" />
          <Input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={t('filtersSearchPlaceholder')}
            className="h-11 pl-10 pr-10 text-sm bg-white/[0.02] border-white/10 hover:bg-white/[0.04] focus-visible:bg-white/[0.05] focus-visible:border-primary/40"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-foreground-subtle hover:text-foreground hover:bg-white/10 transition-colors"
              aria-label={t('filtersClearSearch')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Separator (vertical sur desktop) */}
        <div className="hidden lg:block w-px h-6 bg-white/10" />

        {/* Selects : Statut / Priorité / Catégorie */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden xl:flex items-center gap-1.5 text-[14px] font-medium text-foreground-subtle mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('filtersFacets')}
          </div>
          <Select
            value={status}
            onValueChange={(v: string | null) => v && updateParam('status', v)}
          >
            <SelectTrigger className="h-10 w-[132px] text-sm bg-white/[0.02] border-white/10 hover:bg-white/[0.04]">
              <SelectValue placeholder={t('filtersStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filtersAllStatuses')}</SelectItem>
              {Object.entries(STATUS_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>
                  <span className="flex items-center gap-2">
                    <span className={cn('w-1.5 h-1.5 rounded-full', m.dot)} />
                    {t(m.labelKey)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={priority}
            onValueChange={(v: string | null) => v && updateParam('priority', v)}
          >
            <SelectTrigger className="h-10 w-[132px] text-sm bg-white/[0.02] border-white/10 hover:bg-white/[0.04]">
              <SelectValue placeholder={t('filtersPriority')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filtersAllPriorities')}</SelectItem>
              {Object.entries(PRIORITY_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>
                  <span className="flex items-center gap-2">
                    <span className={cn('w-1.5 h-1.5 rounded-full', m.dot)} />
                    {t(m.labelKey)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={category}
            onValueChange={(v: string | null) => v && updateParam('category', v)}
          >
            <SelectTrigger className="h-10 w-[140px] text-sm bg-white/[0.02] border-white/10 hover:bg-white/[0.04]">
              <SelectValue placeholder={t('filtersCategory')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filtersAllCategories')}</SelectItem>
              {Object.entries(CATEGORY_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>
                  <span className="flex items-center gap-2">
                    <span className={cn('w-1.5 h-1.5 rounded-full', m.dot)} />
                    {t(m.labelKey)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="gap-1.5 text-xs text-foreground-muted hover:text-foreground h-10"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('filtersReset')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Chips filtres actifs — visual feedback dismissible */}
      {(activeChips.length > 0 || qParam) && (
        <div className="flex flex-wrap items-center gap-2 px-3 lg:px-4 pb-3 lg:pb-4 -mt-1">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-foreground-subtle">
            {t('filtersActive')}
          </span>
          {qParam && (
            <button
              type="button"
              onClick={() => setSearchValue('')}
              className="group/chip inline-flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-full text-[14px] font-medium border bg-primary/12 text-primary border-primary/30 hover:bg-primary/18 transition-colors"
            >
              <Search className="w-3 h-3 opacity-70" />
              <span className="max-w-[140px] truncate">{qParam}</span>
              <span className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-white/10 group-hover/chip:bg-white/20 transition-colors">
                <X className="w-2.5 h-2.5" />
              </span>
            </button>
          )}
          {activeChips.map((chip) => (
            <button
              key={`${chip.key}-${chip.value}`}
              type="button"
              onClick={() => updateParam(chip.key, null)}
              className={cn(
                'group/chip inline-flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-full text-[14px] font-medium border transition-colors',
                chip.tone,
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', chip.dot)} />
              {chip.label}
              <span className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-white/10 group-hover/chip:bg-white/20 transition-colors">
                <X className="w-2.5 h-2.5" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
