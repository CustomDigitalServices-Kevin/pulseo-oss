import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getTranslations, getLocale } from 'next-intl/server';
import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { getSessionInfo } from '@/lib/auth/session';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { projProjects, projRecipeTests, projDocuments, projDeliverables } from '@/modules/projects/schema/tables';
import { RecipeTab } from '@/modules/projects/components/recipe-tab';
import { DocumentsTab } from '@/modules/projects/components/documents-tab';
import { DeliverablesTab } from '@/modules/projects/components/deliverables-tab';
import { TicketsLinksTab } from '@/modules/projects/components/tickets-links-tab';
import { listProjectTicketLinks } from '@/modules/projects/actions/ticket-links';

export default async function OrgProjectDetailRoute({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  if (!isProjectsEnabled()) notFound();
  const { slug, id } = await params;

  const session = await getSessionInfo();
  if (!session) notFound();

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org) notFound();

  const ok = await hasProjectsAccess(session.userId, org.id);
  if (!ok) notFound();

  const [project] = await db.select().from(projProjects).where(eq(projProjects.id, id));
  // IDOR guard : le projet doit appartenir à l'org du slug.
  if (!project || project.organization_id !== org.id) notFound();

  const ticketLinksResult = await listProjectTicketLinks(project.id);
  const ticketLinks = ticketLinksResult.success ? ticketLinksResult.data : [];

  const t = await getTranslations('projects.detail');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';

  const [tests, documents, deliverables] = await Promise.all([
    db
      .select()
      .from(projRecipeTests)
      .where(eq(projRecipeTests.project_id, project.id))
      .orderBy(asc(projRecipeTests.order_index), asc(projRecipeTests.created_at)),
    db
      .select()
      .from(projDocuments)
      .where(and(eq(projDocuments.project_id, project.id), isNull(projDocuments.deleted_at)))
      .orderBy(desc(projDocuments.uploaded_at)),
    db
      .select()
      .from(projDeliverables)
      .where(and(eq(projDeliverables.project_id, project.id), isNull(projDeliverables.deleted_at)))
      .orderBy(desc(projDeliverables.uploaded_at)),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/clients/${slug}/projects`} className="text-sm text-foreground-muted hover:underline">
            ← {t('backToList')}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
        </div>
        <Badge>{project.status.replace('_', ' ')}</Badge>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
          <TabsTrigger value="recette">
            {t('tabRecipe')}
            {tests.length > 0 && (
              <span className="ml-1.5 rounded-full bg-elevated px-1.5 text-[12px] tabular-nums">{tests.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents">
            {t('tabDocuments')}
            {documents.length > 0 && (
              <span className="ml-1.5 rounded-full bg-elevated px-1.5 text-[12px] tabular-nums">{documents.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="livrables">
            {t('tabDeliverables')}
            {deliverables.length > 0 && (
              <span className="ml-1.5 rounded-full bg-elevated px-1.5 text-[12px] tabular-nums">{deliverables.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tickets">
            {t('tabTickets')}
            {ticketLinks.length > 0 && (
              <span className="ml-1.5 rounded-full bg-elevated px-1.5 text-[12px] tabular-nums">{ticketLinks.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground-subtle uppercase tracking-wider">{t('overviewTitle')}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-foreground-muted">{t('typeLabel')}</dt>
                <dd className="mt-1 capitalize">{project.type}</dd>
              </div>
              <div>
                <dt className="text-foreground-muted">{t('statusLabel')}</dt>
                <dd className="mt-1 capitalize">{project.status.replace('_', ' ')}</dd>
              </div>
              <div>
                <dt className="text-foreground-muted">{t('startedLabel')}</dt>
                <dd className="mt-1">
                  {project.started_at ? new Date(project.started_at).toLocaleDateString(dateLocale) : t('dash')}
                </dd>
              </div>
              <div>
                <dt className="text-foreground-muted">{t('targetLabel')}</dt>
                <dd className="mt-1">
                  {project.target_date ? new Date(project.target_date).toLocaleDateString(dateLocale) : t('dash')}
                </dd>
              </div>
            </dl>
            {project.description && (
              <p className="mt-4 text-sm text-foreground/80 whitespace-pre-wrap">{project.description}</p>
            )}
          </section>
        </TabsContent>

        <TabsContent value="recette">
          <RecipeTab projectId={project.id} initialTests={tests} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab projectId={project.id} initialDocuments={documents} />
        </TabsContent>

        <TabsContent value="livrables">
          <DeliverablesTab slug={slug} projectId={project.id} initialDeliverables={deliverables} />
        </TabsContent>

        <TabsContent value="tickets">
          <TicketsLinksTab slug={slug} initialLinks={ticketLinks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
