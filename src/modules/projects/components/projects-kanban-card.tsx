"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Ticket, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateProjectStatus } from "@/modules/projects/server";

/**
 * Card projet pour la vue Kanban (UX overhaul).
 *
 * 3 data points (recherche UX 2026 : densité optimale ≤ 4) :
 *   - Nom du projet (titre tronqué 2 lignes max)
 *   - Badge type (dev / refonte / migration / support / autre)
 *   - Badge compteur tickets liés (ex: "3 tickets" — caché si 0)
 *
 * Interaction :
 *   - Click sur le titre → page détail projet
 *   - Click sur l'icône menu → DropdownMenu pour changer le statut (mutation
 *     optimiste via router.refresh, recommandation 2026 : pas de drag-drop
 *     phase 1, cf. WCAG 2.2 + a11y + mobile cassé sur drag-drop natif)
 */

export const KANBAN_STATUSES = [
  "chiffrage",
  "en_cours",
  "recette",
  "valide",
  "en_attente",
  "archive",
] as const;
export type KanbanStatus = (typeof KANBAN_STATUSES)[number];

export type KanbanCardProject = {
  id: string;
  name: string;
  type: string;
  status: string;
  ticket_count: number;
};

const TYPE_TINT: Record<string, string> = {
  dev: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  refonte: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  migration: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  support: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  autre: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

type Props = {
  project: KanbanCardProject;
  orgSlug: string;
};

export function ProjectsKanbanCard({ project, orgSlug }: Props) {
  const router = useRouter();
  const t = useTranslations("projects");
  const tKan = useTranslations("projects.kanban");
  const [isPending, startTransition] = useTransition();

  const typeClass = TYPE_TINT[project.type] ?? TYPE_TINT.autre;

  const handleStatusChange = (next: KanbanStatus) => {
    if (next === project.status) return;
    startTransition(async () => {
      const r = await updateProjectStatus(project.id, next);
      if (!r.success) {
        toast.error(tKan("statusError"));
        return;
      }
      toast.success(tKan("statusUpdated"));
      router.refresh();
    });
  };

  return (
    <article
      className="group relative rounded-lg border border-border bg-canvas p-3 transition-colors hover:border-border-strong focus-within:border-primary/50"
      data-status={project.status}
    >
      <div className="flex items-start gap-2">
        <Link
          href={`/clients/${orgSlug}/projects/${project.id}`}
          className="flex-1 min-w-0 outline-none"
        >
          <h3 className="text-[14px] font-medium text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
            {project.name}
          </h3>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            aria-label={tKan("changeStatus")}
            className="shrink-0 p-1 rounded-md text-foreground-subtle hover:text-foreground hover:bg-elevated transition-colors disabled:opacity-50"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {KANBAN_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => handleStatusChange(s)}
                disabled={s === project.status}
                className="text-[13px]"
              >
                {t(`status.${s}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <Badge
          variant="outline"
          className={`text-[11px] capitalize ${typeClass}`}
        >
          {project.type}
        </Badge>
        {project.ticket_count > 0 && (
          <Badge
            variant="outline"
            className="text-[11px] gap-1 border-border bg-elevated/40 text-foreground-muted"
          >
            <Ticket className="h-3 w-3" />
            {tKan("ticketCount", { count: project.ticket_count })}
          </Badge>
        )}
      </div>
    </article>
  );
}
