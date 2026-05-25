"use client";

import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { createTicket } from "@/actions/tickets";
import { uploadAttachment } from "@/actions/attachments";
import {
  createTicketSchema,
  type CreateTicket,
  type ScenarioStep,
} from "@/lib/validations/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/common/rich-text-editor";
import { ScenarioBuilderModal } from "@/components/tickets/scenario-builder-modal";
import {
  Type,
  FileText,
  Flag,
  Tag,
  Loader2,
  Send,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Paperclip,
  Upload,
  X,
  ImageIcon,
  FileIcon,
  MapPin,
  ListOrdered,
  GitFork,
  MessageSquare,
  Pencil,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProjectSelectField, type ProjectSelectItem } from "@/modules/projects";
import { linkExistingTicketToProject } from "@/modules/projects/server";

interface TicketFormProps {
  slug: string;
  orgId: string;
  /**
   * Liste pré-chargée des projets de l'org (UX overhaul). Si `null`,
   * le module Projets est OFF côté serveur → le sélecteur n'est pas monté.
   * Si `[]`, le module est ON mais aucun projet n'existe encore → le sélecteur
   * affiche un état "Aucun projet disponible" et reste désactivé.
   */
  projects: ProjectSelectItem[] | null;
  /**
   * Callback optionnel invoqué à chaque validation du scenario-builder-modal.
   * Permet à un layout parent (ex: page /tickets/new) de refléter les étapes
   * dans une sidebar preview tout en laissant le form self-contained.
   */
  onScenarioChange?: (steps: ScenarioStep[]) => void;
}

const PRIORITY_VALUES = [
  { value: "low", color: "oklch(0.560 0.010 270)" },
  { value: "medium", color: "oklch(0.625 0.205 264)" },
  { value: "high", color: "oklch(0.795 0.155 80)" },
  { value: "critical", color: "oklch(0.685 0.205 25)" },
] as const;

// Codes couleurs catégories — alignés avec `STATUS_META` côté ticket-filters
// pour garantir une identité visuelle cohérente liste / formulaire / détail.
const CATEGORY_VALUES = [
  {
    value: "bug",
    color: "oklch(0.685 0.205 25)",
    tintClass: "bg-rose-500/10 border-rose-500/30 text-rose-300",
  },
  {
    value: "feature",
    color: "oklch(0.680 0.180 310)",
    tintClass: "bg-violet-500/10 border-violet-500/30 text-violet-300",
  },
  {
    value: "support",
    color: "oklch(0.700 0.165 230)",
    tintClass: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300",
  },
  {
    value: "maintenance",
    color: "oklch(0.700 0.165 155)",
    tintClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  },
] as const;

type PriorityValue = (typeof PRIORITY_VALUES)[number]["value"];
type CategoryValue = (typeof CATEGORY_VALUES)[number]["value"];

const PRIORITY_I18N: Record<PriorityValue, { label: string; desc: string }> = {
  low: { label: "priorityLow", desc: "priorityLowDesc" },
  medium: { label: "priorityMedium", desc: "priorityMediumDesc" },
  high: { label: "priorityHigh", desc: "priorityHighDesc" },
  critical: { label: "priorityCritical", desc: "priorityCriticalDesc" },
};

const CATEGORY_I18N: Record<CategoryValue, { label: string; desc: string }> = {
  bug: { label: "categoryBug", desc: "categoryBugDesc" },
  feature: { label: "categoryFeature", desc: "categoryFeatureDesc" },
  support: { label: "categorySupport", desc: "categorySupportDesc" },
  maintenance: {
    label: "categoryMaintenance",
    desc: "categoryMaintenanceDesc",
  },
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB par fichier
// Doit rester < bodySizeLimit Server Action (25 MB dans next.config.ts).
// Marge 1 MB pour les autres champs du form (titre, description, scenario...).
const MAX_TOTAL_SIZE = 24 * 1024 * 1024; // 24 MB cumulés
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function percentOf(value: number, max: number): number {
  return Math.min(100, Math.round((value / max) * 100));
}

function usageColor(percent: number): string {
  if (percent >= 95) return "oklch(0.685 0.205 25)"; // rouge
  if (percent >= 70) return "oklch(0.795 0.155 80)"; // orange
  return "oklch(0.700 0.165 155)"; // vert
}

export function TicketForm({
  slug,
  orgId,
  projects,
  onScenarioChange,
}: TicketFormProps) {
  const router = useRouter();
  const t = useTranslations("ticket");
  const tCommon = useTranslations("common");
  const tProjectLink = useTranslations("projects.ticketLink");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  // UX overhaul — Sélecteur projet (state local, hors Zod core).
  // Volontairement séparé de `createTicketSchema` pour respecter le cloisonnement
  // module Projets (cf. RAG `module-projets-architecture.md` règle #4 : pas
  // d'ALTER TABLE tickets ADD project_id). Le lien est créé après `createTicket`
  // succès via `linkExistingTicketToProject`.
  const [selectedProjectId, setSelectedProjectId] = useState<
    string | undefined
  >(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
  } = useForm<CreateTicket>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      category: "support",
      organization_id: orgId,
      location: "",
      scenario_steps: [],
    },
  });

  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const scenarioSteps = (watch("scenario_steps") ?? []) as ScenarioStep[];

  const description = watch("description");
  const title = watch("title");
  const selectedPriority = watch("priority");
  const selectedCategory = watch("category");
  const location = watch("location");

  // Label + hints du champ scénario adaptés à la catégorie : bug vs feature vs
  // support/maintenance ont des usages différents (reproduction de bug vs
  // description de fonctionnement attendu vs contexte libre).
  const scenarioMeta = (() => {
    switch (selectedCategory) {
      case "bug":
        return { label: t("scenarioLabelBug"), helper: t("scenarioHelperBug") };
      case "feature":
        return {
          label: t("scenarioLabelFeature"),
          helper: t("scenarioHelperFeature"),
        };
      default:
        return {
          label: t("scenarioLabelDefault"),
          helper: t("scenarioHelperDefault"),
        };
    }
  })();

  // ─── File handling ────────────────────────────────────────────────────────

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const accepted: File[] = [];
    const rejected: string[] = [];

    let runningTotal = files.reduce((sum, f) => sum + f.size, 0);

    for (const file of list) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        rejected.push(t("fileTypeNotAllowed", { name: file.name }));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(
          t("fileTooLarge", {
            name: file.name,
            size: formatBytes(file.size),
            max: formatBytes(MAX_FILE_SIZE),
          }),
        );
        continue;
      }
      if (runningTotal + file.size > MAX_TOTAL_SIZE) {
        rejected.push(
          t("totalSizeExceeded", {
            name: file.name,
            max: formatBytes(MAX_TOTAL_SIZE),
          }),
        );
        continue;
      }
      runningTotal += file.size;
      accepted.push(file);
    }

    if (rejected.length > 0) {
      setError(t("filesRejected", { list: rejected.join(", ") }));
    } else {
      setError(null);
    }
    setFiles((prev) => [...prev, ...accepted]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const onSubmit = async (data: CreateTicket) => {
    setIsSubmitting(true);
    setError(null);
    setUploadStep(t("creatingTicket"));

    const result = await createTicket(data);

    if (!result.success || !result.data) {
      setError(result.error || t("createError"));
      setIsSubmitting(false);
      setUploadStep(null);
      return;
    }

    const ticketId = result.data.id;

    // UX overhaul — Lien ticket→projet (best-effort, non-bloquant).
    // Le ticket existe déjà ; si le link échoue (réseau, race, droits), on
    // affiche un toast non-bloquant et on continue les uploads + la navigation.
    // L'utilisateur peut réessayer le lien depuis la page projet.
    if (selectedProjectId) {
      try {
        const linkResult = await linkExistingTicketToProject(
          ticketId,
          selectedProjectId,
        );
        if (!linkResult.success) {
          toast.error(tProjectLink("linkErrorSilent"));
        }
      } catch {
        toast.error(tProjectLink("linkErrorSilent"));
      }
    }

    // Upload attachments sequentially after the ticket is created
    if (files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStep(
          t("uploadProgress", {
            index: i + 1,
            total: files.length,
            name: file.name,
          }),
        );
        const formData = new FormData();
        formData.append("file", file);
        const upload = await uploadAttachment(ticketId, formData);
        if (!upload.success) {
          setError(
            t("uploadErrorMid", {
              name: file.name,
              reason: upload.error ?? t("uploadErrorReasonUnknown"),
            }),
          );
          setIsSubmitting(false);
          setUploadStep(null);
          // Still navigate to the ticket so the user can retry uploads
          router.push(`/clients/${slug}/tickets/${ticketId}`);
          return;
        }
      }
    }

    router.push(`/clients/${slug}/tickets/${ticketId}`);
  };

  const inputClass = (hasError: boolean) =>
    cn(
      "h-11 bg-canvas dark:bg-canvas border-border focus-visible:border-primary/50 transition-colors",
      hasError && "border-destructive/50 focus-visible:border-destructive/70",
    );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 bg-destructive/10 border border-destructive/30 text-destructive rounded-md text-sm animate-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {/* ─── Section 1 — Identification ─────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-elevated border border-border">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in oklch, oklch(0.625 0.205 264) 35%, transparent), transparent)",
          }}
        />
        <div className="p-5 lg:p-6 space-y-5">
          <header className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
              <Type className="w-3.5 h-3.5 text-primary" />
            </div>
            <h2 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">
              {t("sectionIdentification")}
            </h2>
            <div className="flex-1 h-px bg-border" />
            <span className="text-[12px] font-mono text-foreground-subtle">
              01
            </span>
          </header>

          <div className="space-y-1.5" data-tour-id="ticket-title">
            <Label
              htmlFor="title"
              className="text-xs font-medium text-foreground-muted"
            >
              {t("title")}
            </Label>
            <Input
              id="title"
              {...register("title")}
              placeholder={t("titlePlaceholder")}
              className={inputClass(Boolean(errors.title))}
            />
            <div className="flex items-center justify-between min-h-[16px]">
              {errors.title ? (
                <p className="text-[13px] text-destructive">
                  {errors.title.message}
                </p>
              ) : (
                <p className="text-[13px] text-foreground-subtle">
                  {t("titleHint")}
                </p>
              )}
              <p className="text-[13px] text-foreground-subtle tabular-nums">
                {title?.length ?? 0} / 200
              </p>
            </div>
          </div>

          <div className="space-y-1.5" data-tour-id="ticket-description">
            <Label
              htmlFor="description"
              className="text-xs font-medium text-foreground-muted flex items-center gap-1.5"
            >
              <FileText className="w-3 h-3" />
              {t("description")}
            </Label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder={t("descriptionPlaceholder")}
                  minHeight={220}
                  invalid={Boolean(errors.description)}
                  ariaDescribedBy="description-hint"
                />
              )}
            />
            <div
              id="description-hint"
              className="flex items-center justify-between mt-1.5"
            >
              {errors.description ? (
                <p className="text-[13px] text-destructive">
                  {errors.description.message}
                </p>
              ) : (
                <p className="text-[13px] text-foreground-subtle">
                  {t("descriptionHint")}
                </p>
              )}
              <p className="text-[13px] text-foreground-subtle tabular-nums">
                {description?.length ?? 0} / 10 000
              </p>
            </div>
          </div>

          {/* Localisation : où sur la plateforme se manifeste le sujet du ticket */}
          <div className="space-y-1.5">
            <Label
              htmlFor="location"
              className="text-sm font-medium text-foreground-muted flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              {t("location")}
              <span className="text-[12px] font-normal text-foreground-subtle">
                {tCommon("optional")}
              </span>
            </Label>
            <Input
              id="location"
              {...register("location")}
              placeholder={t("locationPlaceholder")}
              className={inputClass(Boolean(errors.location))}
            />
            <div className="flex items-center justify-between min-h-[16px]">
              {errors.location ? (
                <p className="text-[13px] text-destructive">
                  {errors.location.message}
                </p>
              ) : (
                <p className="text-[13px] text-foreground-subtle">
                  {t("locationHint")}
                </p>
              )}
              <p className="text-[13px] text-foreground-subtle tabular-nums">
                {location?.length ?? 0} / 200
              </p>
            </div>
          </div>

          {/* Sélecteur projet (optionnel) — UX overhaul. Monté */}
          {/* conditionnellement : si le module Projets est OFF ou si l'org n'a */}
          {/* aucun projet, ProjectSelectField gère lui-même le rendu null/disabled. */}
          <ProjectSelectField
            projects={projects}
            orgSlug={slug}
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            disabled={isSubmitting}
          />

          {/* Scénario d'étapes (bug = reproduction, feature = fonctionnement attendu) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground-muted flex items-center gap-1.5">
              <ListOrdered className="w-3.5 h-3.5" />
              {scenarioMeta.label}
              <span className="text-[12px] font-normal text-foreground-subtle">
                {tCommon("optional")}
              </span>
            </Label>
            <p className="text-[13px] text-foreground-subtle">
              {scenarioMeta.helper}
            </p>

            {scenarioSteps.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsScenarioModalOpen(true)}
                className="group w-full flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-canvas hover:bg-elevated/40 transition-all text-left"
              >
                <div className="shrink-0 w-10 h-10 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Workflow className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-foreground">
                    {t("scenarioBuild")}
                  </p>
                  <p className="text-[12px] text-foreground-subtle mt-0.5">
                    {t("scenarioBuildDesc")}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-foreground-subtle group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ) : (
              <div className="rounded-lg border border-border bg-elevated overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-canvas/40">
                  <Workflow className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[13px] font-medium text-foreground">
                    {t("scenarioSummary", { count: scenarioSteps.length })}
                  </span>
                  {scenarioSteps.some((s) => s.condition?.type === "if") && (
                    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[11px] font-medium bg-[oklch(0.795_0.155_80)]/15 text-[oklch(0.795_0.155_80)] ring-1 ring-[oklch(0.795_0.155_80)]/30">
                      <GitFork className="w-3 h-3" />
                      {t("scenarioConditionsBadge")}
                    </span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto gap-1.5 h-7"
                    onClick={() => setIsScenarioModalOpen(true)}
                  >
                    <Pencil className="w-3 h-3" />
                    {t("scenarioEdit")}
                  </Button>
                </div>
                <ul className="divide-y divide-border/60">
                  {scenarioSteps.map((s) => {
                    const isCondition = s.condition?.type === "if";
                    const hasComment =
                      typeof s.comment === "string" &&
                      s.comment.trim().length > 0;
                    return (
                      <li
                        key={s.index}
                        className="px-3 py-2.5 flex items-start gap-2.5"
                      >
                        <span
                          className={cn(
                            "shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md text-[12px] font-semibold tabular-nums",
                            isCondition
                              ? "bg-[oklch(0.795_0.155_80)]/20 ring-1 ring-[oklch(0.795_0.155_80)]/40 text-[oklch(0.795_0.155_80)]"
                              : "bg-primary/15 ring-1 ring-primary/30 text-primary",
                          )}
                        >
                          {s.index}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-foreground">
                            {s.text || (
                              <em className="text-foreground-subtle">
                                {t("scenarioStepEmpty")}
                              </em>
                            )}
                          </p>
                          {isCondition && s.condition?.type === "if" && (
                            <p className="text-[12px] font-mono text-foreground-muted mt-0.5 truncate">
                              <GitFork className="inline w-3 h-3 mr-1 text-[oklch(0.795_0.155_80)]" />
                              {t("scenarioConditionLabel", {
                                expression: s.condition.expression,
                                logic: (
                                  s.condition.logic ?? "and"
                                ).toUpperCase(),
                              })}
                            </p>
                          )}
                        </div>
                        {hasComment && (
                          <MessageSquare className="w-3.5 h-3.5 text-primary shrink-0 mt-1" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {typeof errors.scenario_steps?.message === "string" && (
              <p className="text-[13px] text-destructive">
                {errors.scenario_steps.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ─── Section 2 — Classification (radio cards) ───────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-elevated border border-border">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in oklch, oklch(0.680 0.180 310) 35%, transparent), transparent)",
          }}
        />
        <div className="p-5 lg:p-6 space-y-5">
          <header className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[oklch(0.680_0.180_310)]/12 ring-1 ring-[oklch(0.680_0.180_310)]/25 flex items-center justify-center">
              <Tag className="w-3.5 h-3.5 text-[oklch(0.680_0.180_310)]" />
            </div>
            <h2 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">
              {t("sectionClassification")}
            </h2>
            <div className="flex-1 h-px bg-border" />
            <span className="text-[12px] font-mono text-foreground-subtle">
              02
            </span>
          </header>

          {/* Priority — radio cards */}
          <div className="space-y-2" data-tour-id="ticket-priority">
            <Label className="text-xs font-medium text-foreground-muted flex items-center gap-1.5">
              <Flag className="w-3 h-3" />
              {t("priority")}
            </Label>
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {PRIORITY_VALUES.map((opt) => {
                    const active = selectedPriority === opt.value;
                    const keys = PRIORITY_I18N[opt.value];
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => field.onChange(opt.value)}
                        className={cn(
                          "group relative text-left p-3 rounded-lg border transition-all duration-200",
                          active
                            ? "border-primary/50 bg-primary/8"
                            : "border-border bg-canvas hover:border-border-strong hover:bg-elevated",
                        )}
                        style={
                          active
                            ? {
                                boxShadow: `0 0 0 1px color-mix(in oklch, ${opt.color} 30%, transparent), 0 0 24px -8px color-mix(in oklch, ${opt.color} 40%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: opt.color,
                              boxShadow: `0 0 6px ${opt.color}`,
                            }}
                          />
                          <span
                            className={cn(
                              "text-[14px] font-semibold",
                              active
                                ? "text-foreground"
                                : "text-foreground-muted",
                            )}
                          >
                            {t(keys.label)}
                          </span>
                        </div>
                        <p className="text-[12px] text-foreground-subtle">
                          {t(keys.desc)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          {/* Category — select with descriptions */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground-muted flex items-center gap-1.5">
              <Tag className="w-3 h-3" />
              {t("category")}
            </Label>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {CATEGORY_VALUES.map((opt) => {
                    const active = selectedCategory === opt.value;
                    const keys = CATEGORY_I18N[opt.value];
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => field.onChange(opt.value)}
                        className={cn(
                          "group relative text-left p-3 rounded-lg border transition-all duration-200",
                          active
                            ? "border-primary/50 bg-primary/8"
                            : "border-border bg-canvas hover:border-border-strong hover:bg-elevated",
                        )}
                        style={
                          active
                            ? {
                                boxShadow: `0 0 0 1px color-mix(in oklch, ${opt.color} 30%, transparent), 0 0 24px -8px color-mix(in oklch, ${opt.color} 40%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: opt.color,
                              boxShadow: `0 0 6px ${opt.color}`,
                            }}
                          />
                          <span
                            className={cn(
                              "text-[14px] font-semibold",
                              active
                                ? "text-foreground"
                                : "text-foreground-muted",
                            )}
                          >
                            {t(keys.label)}
                          </span>
                        </div>
                        <p className="text-[12px] text-foreground-subtle">
                          {t(keys.desc)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>
        </div>
      </section>

      <input type="hidden" {...register("organization_id")} />

      {/* ─── Section 3 — Pièces jointes (drag & drop) ──────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-elevated border border-border">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in oklch, oklch(0.700 0.165 155) 35%, transparent), transparent)",
          }}
        />
        <div className="p-5 lg:p-6 space-y-4">
          <header className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center border"
              style={{
                backgroundColor:
                  "color-mix(in oklch, oklch(0.700 0.165 155) 14%, transparent)",
                borderColor:
                  "color-mix(in oklch, oklch(0.700 0.165 155) 28%, transparent)",
              }}
            >
              <Paperclip
                className="w-3.5 h-3.5"
                style={{ color: "oklch(0.700 0.165 155)" }}
              />
            </div>
            <h2
              className="text-[14px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--foreground-muted)" }}
            >
              {t("sectionAttachments")}
            </h2>
            <span
              className="text-[12px] font-medium"
              style={{ color: "var(--foreground-subtle)" }}
            >
              {tCommon("optional")}
            </span>
            <div className="flex-1 h-px bg-border" />
            <span
              className="text-[12px] font-mono"
              style={{ color: "var(--foreground-subtle)" }}
            >
              03
            </span>
          </header>

          {/* Drag & drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer",
              isDragging
                ? "border-primary/60 bg-primary/8"
                : "border-border hover:border-border-strong hover:bg-canvas/40",
            )}
            style={
              isDragging
                ? {
                    boxShadow:
                      "0 0 0 1px oklch(0.625 0.205 264 / 0.30), 0 0 32px -8px oklch(0.625 0.205 264 / 0.40)",
                  }
                : undefined
            }
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES.join(",")}
              onChange={handleFileInputChange}
              className="sr-only"
              aria-label={t("selectFilesAria")}
            />
            <div className="px-6 py-8 text-center">
              <div className="relative w-12 h-12 mx-auto mb-3">
                <div
                  className="absolute inset-0 rounded-2xl blur-xl opacity-50"
                  style={{ background: "oklch(0.625 0.205 264 / 0.30)" }}
                />
                <div className="relative w-12 h-12 rounded-2xl bg-canvas border border-border flex items-center justify-center">
                  <Upload className="w-5 h-5 text-primary" strokeWidth={1.75} />
                </div>
              </div>
              <p className="text-[15px] font-medium text-foreground">
                {t("dropFiles")}{" "}
                <span className="text-primary underline-offset-2 underline decoration-primary/40">
                  {t("browseFiles")}
                </span>
              </p>
              <p
                className="text-[13px] mt-1.5"
                style={{ color: "var(--foreground-subtle)" }}
              >
                {t("acceptedFormats")}
              </p>
              <p
                className="text-[12px] mt-1 tabular-nums"
                style={{ color: "var(--foreground-subtle)" }}
              >
                {t("sizeLimitHint", {
                  perFile: formatBytes(MAX_FILE_SIZE),
                  total: formatBytes(MAX_TOTAL_SIZE),
                })}
              </p>
            </div>
          </div>

          {/* Selected files list */}
          {files.length > 0 && (
            <div className="space-y-1.5 animate-in">
              <div className="flex items-center justify-between text-[13px]">
                <span style={{ color: "var(--foreground-muted)" }}>
                  {t("filesSelected", { count: files.length })}
                </span>
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className="text-foreground-subtle hover:text-destructive transition-colors"
                  style={{ color: "var(--foreground-subtle)" }}
                >
                  {t("removeAllFiles")}
                </button>
              </div>
              {files.map((file, idx) => {
                const isImage = file.type.startsWith("image/");
                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center gap-3 p-2.5 border border-border rounded-md bg-canvas group"
                  >
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 border"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, oklch(0.700 0.165 230) 14%, transparent)",
                        borderColor:
                          "color-mix(in oklch, oklch(0.700 0.165 230) 28%, transparent)",
                      }}
                    >
                      {isImage ? (
                        <ImageIcon
                          className="w-3.5 h-3.5"
                          style={{ color: "oklch(0.700 0.165 230)" }}
                        />
                      ) : (
                        <FileIcon
                          className="w-3.5 h-3.5"
                          style={{ color: "oklch(0.700 0.165 230)" }}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-[14px] font-medium truncate text-foreground">
                        {file.name}
                      </p>
                      <p
                        className="text-[12px] tabular-nums flex items-center gap-1.5"
                        style={{ color: "var(--foreground-subtle)" }}
                      >
                        <span>
                          {formatBytes(file.size)} /{" "}
                          {formatBytes(MAX_FILE_SIZE)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          style={{
                            color: usageColor(
                              percentOf(file.size, MAX_FILE_SIZE),
                            ),
                          }}
                        >
                          {percentOf(file.size, MAX_FILE_SIZE)}%
                        </span>
                      </p>
                      <div
                        className="mt-1 h-1 rounded-full overflow-hidden"
                        style={{
                          backgroundColor:
                            "color-mix(in oklch, var(--foreground-subtle) 18%, transparent)",
                        }}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentOf(file.size, MAX_FILE_SIZE)}
                        aria-label={t("fileUsageAria", { name: file.name })}
                      >
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${percentOf(file.size, MAX_FILE_SIZE)}%`,
                            backgroundColor: usageColor(
                              percentOf(file.size, MAX_FILE_SIZE),
                            ),
                          }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-destructive/15 transition-colors shrink-0"
                      aria-label={t("removeFileAria", { name: file.name })}
                      style={{ color: "var(--foreground-subtle)" }}
                    >
                      <X className="w-3.5 h-3.5 hover:text-destructive transition-colors" />
                    </button>
                  </div>
                );
              })}

              {/* Total cumulé + barre globale */}
              {(() => {
                const total = files.reduce((sum, f) => sum + f.size, 0);
                const pct = percentOf(total, MAX_TOTAL_SIZE);
                const color = usageColor(pct);
                return (
                  <div className="mt-2 px-2.5 py-2 rounded-md border border-border bg-canvas/50">
                    <div className="flex items-center justify-between text-[12px] tabular-nums mb-1">
                      <span style={{ color: "var(--foreground-muted)" }}>
                        {t("totalUsage")}
                      </span>
                      <span>
                        <span
                          className="font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          {formatBytes(total)}
                        </span>
                        <span style={{ color: "var(--foreground-subtle)" }}>
                          {" "}
                          / {formatBytes(MAX_TOTAL_SIZE)}
                        </span>
                        <span className="ml-1.5 font-medium" style={{ color }}>
                          {pct}%
                        </span>
                      </span>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--foreground-subtle) 18%, transparent)",
                      }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      aria-label={t("totalUsageAria")}
                    >
                      <div
                        className="h-full transition-all duration-300"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      {/* ─── Submit ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-2">
        {uploadStep ? (
          <p className="text-[13px] flex items-center gap-1.5 text-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            {uploadStep}
          </p>
        ) : (
          <p
            className="text-[13px] hidden sm:flex items-center gap-1.5"
            style={{ color: "var(--foreground-subtle)" }}
          >
            <Sparkles className="w-3 h-3 text-primary" />
            {t("notifyEmail")}
          </p>
        )}
        <Button
          type="submit"
          disabled={isSubmitting}
          data-tour-id="ticket-submit"
          className="h-11 px-6 text-sm font-medium gap-2 group ml-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {files.length > 0 ? t("submittingUpload") : t("submitting")}
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              {t("submit")}
              <ArrowRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </Button>
      </div>

      <ScenarioBuilderModal
        open={isScenarioModalOpen}
        onOpenChange={setIsScenarioModalOpen}
        initial={scenarioSteps}
        category={selectedCategory}
        onConfirm={(nextSteps) => {
          setValue("scenario_steps", nextSteps, {
            shouldValidate: true,
            shouldDirty: true,
          });
          onScenarioChange?.(nextSteps);
        }}
      />
    </form>
  );
}
