"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  ProjectsKanbanToolbar,
  type SortKey,
  type ViewKey,
} from "@/modules/projects/components/projects-kanban-toolbar";
import { ProjectsKanbanBoard } from "@/modules/projects/components/projects-kanban-board";
import { ProjectsListView } from "@/modules/projects/components/projects-list-view";
import type { ProjectWithCount } from "@/modules/projects/server";

/**
 * Vue principale projets (UX overhaul).
 *
 * Source de vérité = URL searchParams (`?view`, `?q`, `?type`, `?sort`,
 * `?others`). La toolbar les met à jour via `router.replace`, ce composant
 * les lit + filtre + trie + dispatch vers Board ou Liste.
 *
 * Pour la vue Liste, on délègue au composant existant `ProjectsListView`
 * (table shadcn). Pour le Board, on monte `ProjectsKanbanBoard`.
 */

type Props = {
  projects: ProjectWithCount[];
  orgSlug: string;
};

export function ProjectsKanbanView({ projects, orgSlug }: Props) {
  const searchParams = useSearchParams();

  const view: ViewKey = searchParams?.get("view") === "list" ? "list" : "board";
  const query = (searchParams?.get("q") ?? "").toLowerCase().trim();
  const typeFilter = searchParams?.get("type") ?? "__all__";
  const sortRaw = searchParams?.get("sort") ?? "recent";
  const sort: SortKey =
    sortRaw === "alpha" || sortRaw === "target" ? sortRaw : "recent";
  const showOthers = searchParams?.get("others") === "1";

  const filtered = useMemo(() => {
    let out = projects;
    if (query) {
      out = out.filter((p) => p.name.toLowerCase().includes(query));
    }
    if (typeFilter !== "__all__") {
      out = out.filter((p) => p.type === typeFilter);
    }
    if (sort === "alpha") {
      out = [...out].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    } else if (sort === "target") {
      out = [...out].sort((a, b) => {
        const at = a.target_date ? new Date(a.target_date).getTime() : Infinity;
        const bt = b.target_date ? new Date(b.target_date).getTime() : Infinity;
        return at - bt;
      });
    }
    // sort === 'recent' : data déjà triée par updated_at DESC côté serveur,
    // on conserve l'ordre tel quel.
    return out;
  }, [projects, query, typeFilter, sort]);

  return (
    <div className="space-y-4">
      <ProjectsKanbanToolbar
        view={view}
        query={query}
        typeFilter={typeFilter}
        sort={sort}
        showOthers={showOthers}
      />
      {view === "board" ? (
        <ProjectsKanbanBoard
          projects={filtered}
          orgSlug={orgSlug}
          showOthers={showOthers}
        />
      ) : (
        <ProjectsListView projects={filtered} orgSlug={orgSlug} />
      )}
    </div>
  );
}
