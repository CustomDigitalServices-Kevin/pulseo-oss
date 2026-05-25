'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, AlertTriangle, BarChart3, PieChart, Table2, FileText } from 'lucide-react';
import type { PbixManifest, PbixVisual } from '@/modules/projects/lib/preview/pbix';
import type { PreviewAnnotation } from '@/modules/projects/lib/annotation-schema';
import { AnnotationToTicketModal } from '@/modules/projects/components/annotation-to-ticket-modal';

type Status = 'loading' | 'ready' | 'error' | 'not_ready';

function visualStyle(type: string): { fill: string; stroke: string; icon: React.ReactNode } {
  const t = type.toLowerCase();
  if (/bar|column/.test(t)) return { fill: '#6366f122', stroke: '#6366f1', icon: <BarChart3 className="w-3 h-3" /> };
  if (/pie|donut/.test(t)) return { fill: '#ec489922', stroke: '#ec4899', icon: <PieChart className="w-3 h-3" /> };
  if (/table|matrix/.test(t)) return { fill: '#22c55e22', stroke: '#22c55e', icon: <Table2 className="w-3 h-3" /> };
  if (/card|text/.test(t)) return { fill: '#f59e0b22', stroke: '#f59e0b', icon: <FileText className="w-3 h-3" /> };
  return { fill: '#94a3b822', stroke: '#94a3b8', icon: null };
}

function sanitizeIdForAnnotation(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 128);
  return cleaned || 'unknown';
}

function clampCoord(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.round(n)));
}

export function PbixWireframeViewer({
  deliverableId,
  projectId,
  annotationEnabled = false,
}: {
  deliverableId: string;
  projectId?: string;
  annotationEnabled?: boolean;
}) {
  const t = useTranslations('projects.preview');
  const [manifest, setManifest] = useState<PbixManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [selectedAnnotation, setSelectedAnnotation] = useState<PreviewAnnotation | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/deliverables/${deliverableId}/preview-manifest`,
          { signal: ctrl.signal, credentials: 'include' },
        );
        if (cancelled) return;
        if (res.status === 409) {
          const j = await res.json();
          setStatus('not_ready');
          setError(`Preview status: ${j.status ?? 'pending'}`);
          return;
        }
        if (!res.ok) { setStatus('error'); setError(`HTTP ${res.status}`); return; }
        const m = (await res.json()) as PbixManifest;
        setManifest(m);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; ctrl.abort(); };
  }, [deliverableId]);

  const activePage = useMemo(() => manifest?.pages[activePageIdx] ?? null, [manifest, activePageIdx]);

  const handleVisualClick = (pageId: string, visual: PbixVisual) => {
    if (!annotationEnabled || !projectId) return;
    setSelectedAnnotation({
      type: 'pbix',
      deliverable_id: deliverableId,
      page_id: sanitizeIdForAnnotation(pageId),
      visual_id: sanitizeIdForAnnotation(visual.id),
      bbox: {
        x: clampCoord(visual.x),
        y: clampCoord(visual.y),
        w: clampCoord(visual.w),
        h: clampCoord(visual.h),
      },
    });
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center h-full gap-2 text-foreground-muted"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</div>;
  }
  if (status === 'not_ready') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-foreground-muted" />
          <h3 className="text-base font-semibold">{t('processing')}</h3>
          <p className="mt-2 text-sm text-foreground-muted">{error}</p>
        </div>
      </div>
    );
  }
  if (status === 'error' || !manifest) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-6 h-6 mx-auto mb-3 text-amber-500" />
          <h3 className="text-base font-semibold">{t('manifestUnavailable')}</h3>
          <p className="mt-2 text-sm text-foreground-muted">{error ?? 'unknown_error'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background-subtle">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2 overflow-x-auto">
        <div className="text-xs text-foreground-muted mr-2 shrink-0">
          {t('pbixMeta', { pages: manifest.metadata.pageCount, visuals: manifest.metadata.visualCount })}
        </div>
        {manifest.pages.map((p, idx) => (
          <button
            key={p.id}
            onClick={() => setActivePageIdx(idx)}
            className={`px-2 py-1 text-xs rounded-md transition shrink-0 ${
              idx === activePageIdx
                ? 'bg-elevated text-foreground'
                : 'text-foreground-muted hover:bg-elevated/60'
            }`}
          >
            {p.displayName || p.name}
          </button>
        ))}
      </div>

      {annotationEnabled && projectId && (
        <div className="px-3 py-1.5 text-xs text-foreground-muted border-b border-border bg-elevated/30">
          {t('clickVisualHint')}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {activePage && (
          <svg
            viewBox={`0 0 ${activePage.width} ${activePage.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full max-w-5xl mx-auto border border-border rounded-lg bg-white shadow-sm"
            style={{ aspectRatio: `${activePage.width}/${activePage.height}` }}
          >
            <rect x={0} y={0} width={activePage.width} height={activePage.height} fill="#f7f7f8" />
            {activePage.visuals.map((v) => {
              const style = visualStyle(v.type);
              return (
                <g
                  key={v.id}
                  onClick={() => handleVisualClick(activePage.id, v)}
                  style={{ cursor: annotationEnabled ? 'pointer' : 'default' }}
                >
                  <rect
                    x={v.x}
                    y={v.y}
                    width={Math.max(v.w, 1)}
                    height={Math.max(v.h, 1)}
                    rx={6}
                    ry={6}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={1.5}
                  />
                  <text
                    x={v.x + 8}
                    y={v.y + 16}
                    fontSize={11}
                    fill="#111"
                    pointerEvents="none"
                  >
                    {v.title || v.type}
                  </text>
                  <text
                    x={v.x + 8}
                    y={v.y + 30}
                    fontSize={9}
                    fill="#666"
                    pointerEvents="none"
                  >
                    {v.type}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {selectedAnnotation && projectId && (
        <AnnotationToTicketModal
          projectId={projectId}
          annotation={selectedAnnotation}
          onClose={() => setSelectedAnnotation(null)}
        />
      )}
    </div>
  );
}
