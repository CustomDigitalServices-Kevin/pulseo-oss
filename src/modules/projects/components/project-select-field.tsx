"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FolderKanban, FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";

/**
 * Type minimal d'un projet exposé au sélecteur côté form ticket.
 * Volontairement réduit (id + name + status) : on ne fuit pas les autres
 * colonnes (description, dates) qui ne servent pas dans ce contexte.
 */
export type ProjectSelectItem = {
  id: string;
  name: string;
  status: string;
};

type Props = {
  /** Liste pré-chargée côté serveur (page /tickets/new). Si null → ne rien rendre. */
  projects: ProjectSelectItem[] | null;
  /** Slug de l'org courante — sert pour le lien "Créer un projet". */
  orgSlug: string;
  /** Valeur sélectionnée (id projet) ou undefined si "Aucun". */
  value: string | undefined;
  onChange: (projectId: string | undefined) => void;
  disabled?: boolean;
};

/**
 * Sélecteur projet (optionnel) monté dans le formulaire de création de ticket.
 *
 * Cloisonnement (RAG `module-projets-architecture.md` règle #4) : zéro modif
 * de la table `tickets` core. Le lien est créé après `createTicket` succès via
 * l'action `linkExistingTicketToProject` côté module → insert dans
 * `proj_ticket_links` (schema PG dédié `projects`).
 *
 * Comportement par cardinality :
 *  - `projects === null` : module Projets OFF → composant retourne null.
 *  - `projects.length === 0` : aucun projet existant → champ grisé + bouton
 *    « Créer un projet » qui ouvre `/clients/{slug}/projects/new` dans un
 *    nouvel onglet (préserve le state du form ticket en cours).
 *  - `projects.length === 1` : auto-sélection au mount (useEffect).
 *    L'utilisateur peut toujours désélectionner via « Aucun projet ».
 *  - `projects.length > 1` : Select standard avec option « Aucun projet ».
 *
 * Style aligné sur les autres champs du form ticket (Location notamment) :
 *  - Label : `text-sm font-medium text-foreground-muted flex items-center gap-1.5`
 *  - SelectTrigger : `w-full h-11 bg-canvas dark:bg-canvas border-border`
 *  - Helper : `text-[13px] text-foreground-subtle`
 */
export function ProjectSelectField({
  projects,
  orgSlug,
  value,
  onChange,
  disabled,
}: Props) {
  const t = useTranslations("projects.ticketLink");
  const tCommon = useTranslations("common");

  // Auto-sélection si l'utilisateur n'a qu'un seul projet (cas freelance solo
  // ou client n'ayant qu'un projet actif). Ne s'exécute qu'au premier render
  // tant que `value` est undefined, pour ne pas annuler une déselection manuelle.
  const hasExactlyOne = projects?.length === 1;
  useEffect(() => {
    if (hasExactlyOne && !value && projects) {
      onChange(projects[0].id);
    }
    // On veut ce effect uniquement quand la liste change ou le mount initial.
    // `onChange` (ref stable côté form) volontairement omis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExactlyOne, projects]);

  if (!projects) return null;

  const NONE_VALUE = "__none__";
  const hasProjects = projects.length > 0;

  // ── Cas 0 : aucun projet ──────────────────────────────────────────────────
  if (!hasProjects) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-foreground-muted flex items-center gap-1.5">
          <FolderKanban className="w-3.5 h-3.5" />
          {t("label")}
          <span className="text-[12px] font-normal text-foreground-subtle">
            {tCommon("optional")}
          </span>
        </Label>
        <div className="flex items-stretch gap-2">
          <div className="flex-1 flex items-center h-11 px-3 rounded-md border border-border bg-canvas dark:bg-canvas text-[14px] text-foreground-subtle italic">
            {t("noneAvailable")}
          </div>
          <Link
            href={`/clients/${orgSlug}/projects/new`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "h-11 shrink-0 gap-1.5",
            })}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            {t("createNew")}
          </Link>
        </div>
        <p className="text-[13px] text-foreground-subtle">{t("helperEmpty")}</p>
      </div>
    );
  }

  // ── Cas 1+ projets : Select standard ──────────────────────────────────────
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground-muted flex items-center gap-1.5">
        <FolderKanban className="w-3.5 h-3.5" />
        {t("label")}
        <span className="text-[12px] font-normal text-foreground-subtle">
          {tCommon("optional")}
        </span>
      </Label>
      <Select
        value={value ?? NONE_VALUE}
        onValueChange={(v) => {
          if (!v || v === NONE_VALUE) {
            onChange(undefined);
            return;
          }
          onChange(v);
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-full h-11 bg-canvas dark:bg-canvas border-border focus-visible:border-primary/50 transition-colors">
          {/* Children explicite (override) pour éviter tout leak de la VALUE
              technique `__none__` au cas où Radix afficherait la value brute
              lors d'un hydration mismatch ou d'un état transitoire. */}
          <SelectValue placeholder={t("noneOption")}>
            {value
              ? (projects.find((p) => p.id === value)?.name ?? t("noneOption"))
              : t("noneOption")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>{t("noneOption")}</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[13px] text-foreground-subtle">{t("helper")}</p>
    </div>
  );
}
