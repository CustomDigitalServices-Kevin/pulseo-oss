'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Viewer image avec zoom controls. Next Image désactivé (SSR complexe sur
 * URL protégée par IDOR) — on utilise `<img>` natif avec URL de la route
 * download qui streame les bytes avec `Content-Type: image/*`.
 */
export function ImageViewer({
  deliverableId,
  originalName,
}: {
  deliverableId: string;
  originalName: string;
}) {
  const t = useTranslations('projects.previewImage');
  const [zoom, setZoom] = useState(1);

  const src = `/api/projects/deliverables/${deliverableId}/download`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end gap-1 border-b border-border px-3 py-2 bg-elevated/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
          aria-label={t('zoomOut')}
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs tabular-nums text-foreground-muted min-w-[48px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          aria-label={t('zoomIn')}
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom(1)}
          aria-label={t('resetZoom')}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto bg-background-subtle">
        <div
          className="min-h-full flex items-center justify-center p-4"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={originalName}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          />
          {/* `next/image` inutilisable ici : le loader Next ne supporte pas
               les URLs protégées par IDOR (re-request sans cookies). */}
        </div>
      </div>
    </div>
  );
}
