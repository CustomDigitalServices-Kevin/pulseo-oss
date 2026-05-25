import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getSessionInfo } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button-variants";
import { isProjectsEnabled } from "@/modules/projects/feature-flag";
import { hasProjectsAccess } from "@/modules/projects/lib/permissions";
import { listProjectsWithCounts } from "@/modules/projects/actions/projects";
import { ProjectsKanbanView } from "@/modules/projects/components/projects-kanban-view";

export default async function OrgProjectListRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isProjectsEnabled()) notFound();
  const { slug } = await params;

  const session = await getSessionInfo();
  if (!session) notFound();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug));
  if (!org) notFound();

  const ok = await hasProjectsAccess(session.userId, org.id);
  if (!ok) notFound();

  // UX overhaul: Kanban view avec compteurs tickets liés. Le
  // composant client gère vue Board / List via URL searchParams.
  const r = await listProjectsWithCounts(org.id);
  const projects = r.success ? r.data : [];

  const t = await getTranslations("projects.list");

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-6 lg:p-8 animate-in">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          {t("title")}
        </h1>
        <Link
          href={`/clients/${slug}/projects/new`}
          className={buttonVariants()}
        >
          {t("new")}
        </Link>
      </div>
      <ProjectsKanbanView projects={projects} orgSlug={slug} />
    </div>
  );
}
