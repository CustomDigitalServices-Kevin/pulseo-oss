"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, LayoutGrid, List, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_TYPES } from "@/modules/projects/lib/validations/projects";

/**
 * Toolbar de la vue projets (UX overhaul).
 *
 * État partagé via URL searchParams (pattern M3) :
 *   - `?view=board|list` (default board)
 *   - `?q=<text>` (recherche client-side, propagée vers KanbanView)
 *   - `?type=<dev|refonte|...>` (filtre type)
 *   - `?sort=recent|alpha|target` (default recent)
 *   - `?others=1` (afficher En attente / Archivé)
 *
 * Avantage URL state : shareable, bookmarkable, survit reload, back-button OK,
 * compatible SSR partiel. Pas de localStorage requis.
 */

export type SortKey = "recent" | "alpha" | "target";
export type ViewKey = "board" | "list";

type Props = {
  view: ViewKey;
  query: string;
  typeFilter: string;
  sort: SortKey;
  showOthers: boolean;
};

export function ProjectsKanbanToolbar({
  view,
  query,
  typeFilter,
  sort,
  showOthers,
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const tKan = useTranslations("projects.kanban");

  const updateParam = (updater: (params: URLSearchParams) => void): void => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    updater(next);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Toggle Board / List */}
      <div
        role="group"
        aria-label={tKan("title")}
        className="inline-flex rounded-md border border-border bg-canvas p-0.5"
      >
        <Button
          type="button"
          variant={view === "board" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2.5 gap-1.5"
          onClick={() => updateParam((p) => p.set("view", "board"))}
          aria-pressed={view === "board"}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="text-[12px]">{tKan("viewBoard")}</span>
        </Button>
        <Button
          type="button"
          variant={view === "list" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2.5 gap-1.5"
          onClick={() => updateParam((p) => p.set("view", "list"))}
          aria-pressed={view === "list"}
        >
          <List className="h-3.5 w-3.5" />
          <span className="text-[12px]">{tKan("viewList")}</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground-subtle" />
        <Input
          type="search"
          defaultValue={query}
          placeholder={tKan("search")}
          className="h-8 pl-8 text-[13px]"
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            updateParam((p) => {
              if (v) p.set("q", v);
              else p.delete("q");
            });
          }}
        />
      </div>

      {/* Filter type */}
      <Select
        value={typeFilter}
        onValueChange={(v) => {
          if (!v) return;
          updateParam((p) => {
            if (v === "__all__") p.delete("type");
            else p.set("type", v);
          });
        }}
      >
        <SelectTrigger className="h-8 w-[140px] text-[13px]">
          <SelectValue placeholder={tKan("filterType")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{tKan("filterTypeAll")}</SelectItem>
          {PROJECT_TYPES.map((t) => (
            <SelectItem key={t} value={t} className="capitalize">
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select
        value={sort}
        onValueChange={(v) => {
          if (!v) return;
          updateParam((p) => p.set("sort", v));
        }}
      >
        <SelectTrigger className="h-8 w-[160px] text-[13px]">
          <SelectValue placeholder={tKan("sortLabel")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">{tKan("sortRecent")}</SelectItem>
          <SelectItem value="alpha">{tKan("sortAlpha")}</SelectItem>
          <SelectItem value="target">{tKan("sortTarget")}</SelectItem>
        </SelectContent>
      </Select>

      {/* Toggle "Autres" (en_attente + archive) */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-[12px]"
        onClick={() =>
          updateParam((p) => {
            if (showOthers) p.delete("others");
            else p.set("others", "1");
          })
        }
      >
        {showOthers ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        {showOthers ? tKan("hideOthers") : tKan("showOthers")}
      </Button>
    </div>
  );
}
