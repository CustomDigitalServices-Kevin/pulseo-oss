import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getSessionInfo } from "@/lib/auth/session";
import { isProjectsEnabled } from "@/modules/projects/feature-flag";
import { hasProjectsAccess } from "@/modules/projects/lib/permissions";
import { ProjectForm } from "@/modules/projects/components/project-form";

export default async function OrgProjectNewRoute({
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

  const t = await getTranslations("projects.list");

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-6 lg:p-8 animate-in">
      <h1 className="text-2xl font-semibold">{t("newHeading")}</h1>
      <ProjectForm orgSlug={slug} organizationId={org.id} mode="create" />
    </div>
  );
}
