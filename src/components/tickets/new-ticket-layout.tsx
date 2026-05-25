"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TicketForm } from "@/components/tickets/ticket-form";
import { ScenarioFlowPreview } from "@/components/tickets/scenario-flow-preview";
import { SpotlightCard } from "@/components/common/spotlight-card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  Maximize2,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import type { ScenarioStep } from "@/lib/validations/tickets";
import type { ProjectSelectItem } from "@/modules/projects";

/**
 * Layout client pour la page /clients/[slug]/tickets/new. Encapsule le form
 * + la sidebar guidance. Partage l'état `scenario_steps` entre le form
 * (source) et la sidebar (preview live) via une prop `onScenarioChange`.
 *
 * Séparé de la page RSC parente (qui fait `getOrganization`) pour garder le
 * data-fetching server-side + l'interactivité client au bon endroit.
 */

interface NewTicketLayoutProps {
  slug: string;
  orgId: string;
  orgName: string;
  /**
   * Liste pré-chargée des projets de l'org (UX overhaul). Si le
   * module Projets est OFF côté serveur, la page passe `null` → le sélecteur
   * dans `TicketForm` ne sera pas monté (cf. `ProjectSelectField`).
   */
  projects: ProjectSelectItem[] | null;
}

export function NewTicketLayout({
  slug,
  orgId,
  projects,
}: NewTicketLayoutProps) {
  const t = useTranslations("ticket");
  const [scenarioSteps, setScenarioSteps] = useState<ScenarioStep[]>([]);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const tips = [
    t("bestPractice1"),
    t("bestPractice2"),
    t("bestPractice3"),
    t("bestPractice4"),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Form — 2 columns */}
      <div className="lg:col-span-2">
        <TicketForm
          slug={slug}
          orgId={orgId}
          projects={projects}
          onScenarioChange={setScenarioSteps}
        />
      </div>

      {/* Side panel — guidance + scenario preview */}
      <aside className="space-y-3">
        <SpotlightCard
          tintVar="oklch(0.625 0.205 264)"
          className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border"
        >
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-30"
            style={{
              background:
                "radial-gradient(circle, oklch(0.625 0.205 264) 0%, transparent 65%)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklch, oklch(0.625 0.205 264) 35%, transparent), transparent)",
            }}
          />
          <div className="relative p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                {t("bestPractices")}
              </h3>
            </div>
            <ul className="space-y-2">
              {tips.map((tip, i) => (
                <li
                  key={tip}
                  className="flex items-start gap-2 text-[14px] text-foreground-muted leading-relaxed"
                >
                  <span className="w-4 h-4 shrink-0 rounded-full bg-canvas border border-border-strong flex items-center justify-center text-[9px] font-semibold text-foreground tabular-nums mt-0.5">
                    {i + 1}
                  </span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </SpotlightCard>

        <SpotlightCard
          tintVar="oklch(0.700 0.165 155)"
          className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border"
        >
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-30"
            style={{
              background:
                "radial-gradient(circle, oklch(0.700 0.165 155) 0%, transparent 65%)",
            }}
          />
          <div className="relative p-5 space-y-3">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-[oklch(0.700_0.165_155)] shrink-0 mt-0.5" />
              <div>
                <p className="text-[14px] font-medium">{t("quickResponse")}</p>
                <p className="text-[13px] text-foreground-subtle mt-0.5">
                  {t("quickResponseDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[oklch(0.700_0.165_230)] shrink-0 mt-0.5" />
              <div>
                <p className="text-[14px] font-medium">
                  {t("realtimeTracking")}
                </p>
                <p className="text-[13px] text-foreground-subtle mt-0.5">
                  {t("realtimeTrackingDesc")}
                </p>
              </div>
            </div>
          </div>
        </SpotlightCard>

        {/* Scenario flow preview — visible dès qu'une étape est validée */}
        {scenarioSteps.length > 0 && (
          <div className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in oklch, oklch(0.680 0.180 310) 35%, transparent), transparent)",
              }}
            />
            <div className="relative px-4 py-2.5 border-b border-border flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[oklch(0.680_0.180_310)]/12 ring-1 ring-[oklch(0.680_0.180_310)]/25 flex items-center justify-center">
                <Workflow className="w-3 h-3 text-[oklch(0.680_0.180_310)]" />
              </div>
              <h3 className="text-[13px] font-semibold text-foreground">
                {t("scenarioPreview")}
              </h3>
              <span className="ml-auto text-[11px] font-mono text-foreground-subtle tabular-nums">
                {t("scenarioStepsCount", { count: scenarioSteps.length })}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => setIsFullscreenOpen(true)}
                aria-label={t("scenarioFullscreenOpen")}
                title={t("scenarioFullscreenOpen")}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="h-[320px] w-full">
              <ScenarioFlowPreview steps={scenarioSteps} animated />
            </div>
          </div>
        )}
      </aside>

      {/* Fullscreen preview dialog */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent
          className="!max-w-[96vw] !w-[96vw] !h-[92vh] sm:!max-w-[96vw] p-0 gap-0 overflow-hidden flex flex-col"
          showCloseButton={false}
        >
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-md bg-[oklch(0.680_0.180_310)]/12 ring-1 ring-[oklch(0.680_0.180_310)]/25 flex items-center justify-center">
              <Workflow className="w-4 h-4 text-[oklch(0.680_0.180_310)]" />
            </div>
            <DialogTitle className="text-[15px] flex-1 min-w-0 truncate">
              {t("scenarioSummary", { count: scenarioSteps.length })}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsFullscreenOpen(false)}
              aria-label={t("scenarioFullscreenClose")}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <ScenarioFlowPreview steps={scenarioSteps} animated />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
