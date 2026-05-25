"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  ProjectsKanbanCard,
  type KanbanCardProject,
} from "@/modules/projects/components/projects-kanban-card";

/**
 * Board Kanban — 4 colonnes principales + colonne "Autres" optionnelle
 * (UX overhaul). UX research notes:
 *   - Layout flex horizontal avec scroll-snap (Linear / Trello mobile pattern)
 *   - Colonnes 280px shrink-0, snap-start
 *   - Header colonne : dot 8px coloré + label + Badge counter
 *   - Fond colonne neutre `bg-muted/30` (saturation visuelle évitée)
 */

type ColumnDef = {
  key: string;
  statuses: string[];
  /** Tailwind color token pour le dot 8px du header. */
  dotClass: string;
};

const COLUMNS: ColumnDef[] = [
  { key: "chiffrage", statuses: ["chiffrage"], dotClass: "bg-blue-500" },
  { key: "en_cours", statuses: ["en_cours"], dotClass: "bg-amber-500" },
  { key: "recette", statuses: ["recette"], dotClass: "bg-purple-500" },
  { key: "valide", statuses: ["valide"], dotClass: "bg-emerald-500" },
];

const OTHERS_COLUMN: ColumnDef = {
  key: "en_attente",
  statuses: ["en_attente", "archive"],
  dotClass: "bg-zinc-500",
};

type Props = {
  projects: KanbanCardProject[];
  orgSlug: string;
  showOthers: boolean;
};

export function ProjectsKanbanBoard({ projects, orgSlug, showOthers }: Props) {
  const t = useTranslations("projects");
  const tKan = useTranslations("projects.kanban");

  const columns = showOthers ? [...COLUMNS, OTHERS_COLUMN] : COLUMNS;

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-foreground-subtle text-sm">
        {tKan("emptyAll")}
      </div>
    );
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-thin"
      role="region"
      aria-label={tKan("title")}
    >
      {columns.map((col) => {
        const colProjects = projects.filter((p) =>
          col.statuses.includes(p.status),
        );
        return (
          <section
            key={col.key}
            className="w-[280px] shrink-0 snap-start rounded-lg bg-elevated/40 border border-border p-3 flex flex-col gap-2.5"
            aria-labelledby={`kanban-col-${col.key}`}
          >
            <header className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${col.dotClass}`}
                  aria-hidden
                />
                <h2
                  id={`kanban-col-${col.key}`}
                  className="text-[13px] font-semibold uppercase tracking-[0.06em] text-foreground-muted truncate"
                >
                  {t(`status.${col.key}`)}
                </h2>
              </div>
              <Badge
                variant="secondary"
                className="text-[11px] tabular-nums shrink-0"
              >
                {colProjects.length}
              </Badge>
            </header>

            <div className="space-y-2 min-h-[60px]">
              {colProjects.length === 0 ? (
                <p className="text-[12px] text-foreground-subtle italic px-1">
                  {tKan("empty")}
                </p>
              ) : (
                colProjects.map((p) => (
                  <ProjectsKanbanCard
                    key={p.id}
                    project={p}
                    orgSlug={orgSlug}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
