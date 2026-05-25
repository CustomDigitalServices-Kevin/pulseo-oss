import { notFound } from 'next/navigation';
import Link from 'next/link';
import { promises as fs } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, Download } from 'lucide-react';
import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { getSessionInfo } from '@/lib/auth/session';
import { buttonVariants } from '@/components/ui/button-variants';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { projProjects, projDeliverables } from '@/modules/projects/schema/tables';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { PdfViewer } from '@/modules/projects/components/preview/pdf-viewer';
import { ImageViewer } from '@/modules/projects/components/preview/image-viewer';
import { FlowDiagramViewer } from '@/modules/projects/components/preview/flow-diagram-viewer';
import { MsappWireframeViewer } from '@/modules/projects/components/preview/msapp-wireframe-viewer';
import { SolutionTreeViewer } from '@/modules/projects/components/preview/solution-tree-viewer';
import { PbixWireframeViewer } from '@/modules/projects/components/preview/pbix-wireframe-viewer';

export default async function DeliverablePreviewRoute({
  params,
}: {
  params: Promise<{ slug: string; id: string; deliverableId: string }>;
}) {
  if (!isProjectsEnabled()) notFound();
  const { slug, id, deliverableId } = await params;

  const session = await getSessionInfo();
  if (!session) notFound();

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org) notFound();

  const ok = await hasProjectsAccess(session.userId, org.id);
  if (!ok) notFound();

  const [project] = await db.select().from(projProjects).where(eq(projProjects.id, id));
  if (!project || project.organization_id !== org.id) notFound();

  const [deliverable] = await db
    .select()
    .from(projDeliverables)
    .where(eq(projDeliverables.id, deliverableId));
  if (!deliverable || deliverable.project_id !== project.id) notFound();
  if (deliverable.deleted_at) notFound();
  if (deliverable.kind !== 'file' || !deliverable.file_path) notFound();

  // Audit log — preview viewed (obligatoire par spec §"Audit logging")
  await writeProjectAuditLog({
    organizationId: org.id,
    actorId: session.userId,
    eventType: 'deliverable_preview_viewed',
    entityType: 'deliverable',
    entityId: deliverable.id,
    metadata: { project_id: project.id, version: deliverable.version },
  });

  const mime = deliverable.mime_type ?? '';
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(deliverable.original_name ?? '');
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|svg)$/i.test(deliverable.original_name ?? '');
  const hasManifest = deliverable.preview_manifest_path != null;

  // Détection du type de preview via la shape du manifest stocké. Best-effort :
  // si le fichier est absent ou corrompu, on tombe sur fallback.
  let previewKind: 'flow' | 'msapp' | 'solution' | 'pbix' | 'unknown' = 'unknown';
  if (hasManifest && deliverable.preview_manifest_path) {
    try {
      // Garde anti-traversal : manifest sous STORAGE_PATH
      const storageRoot = path.resolve(process.env.STORAGE_PATH || '/opt/pulseo-storage');
      const normalized = path.resolve(deliverable.preview_manifest_path);
      if (normalized.startsWith(storageRoot + path.sep)) {
        const raw = await fs.readFile(normalized, 'utf8');
        const m = JSON.parse(raw) as Record<string, unknown>;
        if ('solutionName' in m) previewKind = 'solution';
        else if ('appName' in m && Array.isArray(m.screens)) previewKind = 'msapp';
        else if (Array.isArray(m.pages) && m.pages.length > 0
          && typeof (m.pages[0] as Record<string, unknown>).width === 'number') previewKind = 'pbix';
        else if (Array.isArray(m.nodes) && Array.isArray(m.edges)) previewKind = 'flow';
      }
    } catch {
      // fallback — le viewer fera le fetch API et affichera l'erreur propre
    }
  }

  const t = await getTranslations('projects.deliverablePreview');

  return (
    <div className="flex flex-col h-[calc(100vh-var(--sidebar-height,0px))]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 bg-elevated/30">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/clients/${slug}/projects/${project.id}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            {t('back')}
          </Link>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {deliverable.original_name ?? '—'}
            </div>
            <div className="text-xs text-foreground-muted">
              {t('version', { version: deliverable.version })}
              {deliverable.is_latest && <span className="ml-2 text-amber-500">{t('latest')}</span>}
            </div>
          </div>
        </div>
        <a
          href={`/api/projects/deliverables/${deliverable.id}/download`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          {t('download')}
        </a>
      </div>

      <div className="flex-1 min-h-0">
        {isPdf ? (
          <PdfViewer
            deliverableId={deliverable.id}
            originalName={deliverable.original_name ?? ''}
          />
        ) : isImage ? (
          <ImageViewer
            deliverableId={deliverable.id}
            originalName={deliverable.original_name ?? ''}
          />
        ) : previewKind === 'msapp' ? (
          <MsappWireframeViewer
            deliverableId={deliverable.id}
            projectId={project.id}
            annotationEnabled
          />
        ) : previewKind === 'solution' ? (
          <SolutionTreeViewer
            deliverableId={deliverable.id}
            projectId={project.id}
            annotationEnabled
          />
        ) : previewKind === 'pbix' ? (
          <PbixWireframeViewer
            deliverableId={deliverable.id}
            projectId={project.id}
            annotationEnabled
          />
        ) : previewKind === 'flow' ? (
          <FlowDiagramViewer
            deliverableId={deliverable.id}
            projectId={project.id}
            annotationEnabled
          />
        ) : (
          <UnsupportedFallback />
        )}
      </div>
    </div>
  );
}

async function UnsupportedFallback() {
  const t = await getTranslations('projects.deliverablePreview');
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <h2 className="text-base font-semibold">{t('unsupportedTitle')}</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          {t('unsupportedBody')}
        </p>
        <p className="mt-3 text-xs text-foreground-subtle">
          {t('unsupportedNote')}
        </p>
      </div>
    </div>
  );
}

