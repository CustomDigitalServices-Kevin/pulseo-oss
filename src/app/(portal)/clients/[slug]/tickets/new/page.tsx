import { NewTicketLayout } from "@/components/tickets/new-ticket-layout";
import { getOrganization } from "@/actions/organizations";
import Link from "next/link";
import { ArrowLeft, Ticket, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { isProjectsEnabled } from "@/modules/projects/feature-flag";
import { listProjects } from "@/modules/projects/server";
import type { ProjectSelectItem } from "@/modules/projects";

export default async function NewTicketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("ticket");
  const tCommon = await getTranslations("common");

  const orgResult = await getOrganization(slug);
  if (!orgResult.success || !orgResult.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-10 h-10 text-foreground-subtle/40" />
        <p className="text-sm text-foreground-muted mt-3">{t("orgNotFound")}</p>
        <Link href="/admin/clients">
          <Button variant="outline" size="sm" className="mt-4">
            {tCommon("back")}
          </Button>
        </Link>
      </div>
    );
  }

  const org = orgResult.data;

  // UX overhaul: pré-chargement projets pour le sélecteur dans
  // le form ticket. Si le module Projets est OFF → `null`, le sélecteur n'est
  // pas monté côté client. Si le module est ON mais l'utilisateur n'a pas
  // accès projets, `listProjects` renvoie `forbidden` → on traite comme `null`
  // (cohérent avec le gating sidebar via `hasProjectsAccess`).
  let projects: ProjectSelectItem[] | null = null;
  if (isProjectsEnabled()) {
    const projResult = await listProjects({ organizationId: org.id });
    if (projResult.success) {
      projects = projResult.data
        .filter((p) => p.status !== "archive")
        .map((p) => ({ id: p.id, name: p.name, status: p.status }));
    }
  }

  return (
    <div className="p-6 lg:p-8 animate-in">
      <div>
        {/* Back link */}
        <Link
          href={`/clients/${slug}/tickets`}
          className="inline-flex items-center gap-1.5 text-[13px] text-foreground-subtle hover:text-foreground transition-colors mb-5 group"
        >
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
          {t("backToList")}
        </Link>

        {/* Hero header */}
        <div className="flex items-start gap-3 mb-6">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.205 264) 100%, white 12%), oklch(0.625 0.205 264))",
              borderColor:
                "color-mix(in oklch, oklch(0.625 0.205 264) 50%, transparent)",
              boxShadow:
                "0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px oklch(0.625 0.205 264 / 0.45)",
            }}
          >
            <Ticket className="w-5 h-5 text-white relative z-10" />
          </div>
          <div className="flex-1">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
              {t("new")}
            </h1>
            <p className="text-[15px] text-foreground-muted mt-1">
              {t.rich("newSubtitleRich", {
                name: org.name,
                org: (chunks) => (
                  <span className="text-foreground font-medium">{chunks}</span>
                ),
              })}
            </p>
          </div>
        </div>

        <NewTicketLayout
          slug={slug}
          orgId={org.id}
          orgName={org.name}
          projects={projects}
        />
      </div>
    </div>
  );
}
