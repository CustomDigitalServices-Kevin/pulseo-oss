'use client';

import { useTranslations } from 'next-intl';

/**
 * Viewer PDF simple pour MVP — `<iframe>` natif pointant vers la route
 * download qui sert le PDF avec `Content-Type: application/pdf`.
 *
 * Rationale (P4a): pas de `react-pdf`/`pdfjs-dist` (~250kb bundle)
 * pour le MVP. Le browser nativement rend les PDF via `<iframe>` avec un UI
 * acceptable (zoom, navigation pages, search, download). `react-pdf` sera
 * introduit en P10 quand l'annotation pixel-level devient requise.
 *
 * Content-Disposition côté API : noter que notre route download envoie
 * `attachment; filename=...` ce qui force le téléchargement dans certains
 * browsers (Chrome, Firefox). Pour le preview on exploite le fait que
 * Chrome ouvre quand même le PDF inline dans l'iframe grâce au Content-Type
 * application/pdf. Si ça pose problème on ajoutera un param `?inline=true`
 * sur la route download pour switcher en `inline; filename=...`.
 */
export function PdfViewer({
  deliverableId,
  originalName,
}: {
  deliverableId: string;
  originalName: string;
}) {
  const t = useTranslations('projects.previewPdf');
  const src = `/api/projects/deliverables/${deliverableId}/download#view=FitH&toolbar=1`;
  return (
    <div className="flex flex-col h-full min-h-[600px]">
      <iframe
        src={src}
        title={t('titleAria', { name: originalName })}
        className="flex-1 w-full border-0 bg-background-subtle"
        // sandbox limite l'exécution de scripts embarqués dans le PDF (rare
        // mais existe — JS PDF). allow-same-origin nécessaire pour que
        // l'iframe puisse faire le fetch de la même origine.
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  );
}
