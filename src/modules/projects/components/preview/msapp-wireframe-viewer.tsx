'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { MsappManifest, MsappControl } from '@/modules/projects/lib/preview/msapp';
import type { PreviewAnnotation } from '@/modules/projects/lib/annotation-schema';
import { AnnotationToTicketModal } from '@/modules/projects/components/annotation-to-ticket-modal';

/**
 * Wireframe SVG pour MSAPP Power Apps. Rend chaque screen dans un SVG
 * dimensionné à 1366×768 (taille canvas Power Apps par défaut), avec un
 * rectangle par contrôle coloré selon le type.
 *
 * Click sur un contrôle → ouvre modal AnnotationToTicketModal avec annotation
 * msapp. L'annotation inclut screen_id + control_id + bbox pour traçabilité
 * précise.
 */

const CANVAS_W = 1366;
const CANVAS_H = 768;

type Status = 'loading' | 'ready' | 'error' | 'not_ready';

export function MsappWireframeViewer({
  deliverableId,
  projectId,
  annotationEnabled = false,
}: {
  deliverableId: string;
  projectId?: string;
  annotationEnabled?: boolean;
}) {
  const t = useTranslations('projects.preview');
  const [manifest, setManifest] = useState<MsappManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [activeScreenIdx, setActiveScreenIdx] = useState(0);
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
        if (!res.ok) {
          setStatus('error');
          setError(`HTTP ${res.status}`);
          return;
        }
        const m = (await res.json()) as MsappManifest;
        setManifest(m);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [deliverableId]);

  const activeScreen = useMemo(() => manifest?.screens[activeScreenIdx] ?? null, [manifest, activeScreenIdx]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-foreground-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
      </div>
    );
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

  const handleControlClick = (screenId: string, control: MsappControl) => {
    if (!annotationEnabled || !projectId) return;
    setSelectedAnnotation({
      type: 'msapp',
      deliverable_id: deliverableId,
      screen_id: sanitizeIdForAnnotation(screenId),
      control_id: sanitizeIdForAnnotation(control.id),
      bbox: {
        x: clampCoord(control.x),
        y: clampCoord(control.y),
        w: clampCoord(control.w),
        h: clampCoord(control.h),
      },
    });
  };

  return (
    <div className="flex flex-col h-full bg-background-subtle">
      {/* Screens tabs */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-2 overflow-x-auto">
        <div className="text-xs text-foreground-muted mr-2 shrink-0">
          <strong>{manifest.appName}</strong> · {t('msappControlCount', { count: manifest.metadata.controlCount })}
        </div>
        {manifest.screens.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => setActiveScreenIdx(idx)}
            className={`px-2 py-1 text-xs rounded-md transition shrink-0 ${
              idx === activeScreenIdx
                ? 'bg-elevated text-foreground'
                : 'text-foreground-muted hover:bg-elevated/60'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Hint */}
      {annotationEnabled && projectId && (
        <div className="px-3 py-1.5 text-xs text-foreground-muted border-b border-border bg-elevated/30">
          {t('clickControlHint')}
        </div>
      )}

      {/* Canvas SVG */}
      <div className="flex-1 overflow-auto p-6">
        {activeScreen && (
          <svg
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full max-w-5xl mx-auto border border-border rounded-lg bg-white shadow-sm"
            style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
          >
            <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="#f7f7f8" />
            {activeScreen.controls.map((c) => (
              <g
                key={c.id}
                onClick={() => handleControlClick(activeScreen.id, c)}
                style={{ cursor: annotationEnabled ? 'pointer' : 'default' }}
              >
                <rect
                  x={c.x}
                  y={c.y}
                  width={Math.max(c.w, 1)}
                  height={Math.max(c.h, 1)}
                  rx={4}
                  ry={4}
                  {...controlStyle(c.type)}
                />
                <text
                  x={c.x + 6}
                  y={c.y + 14}
                  fontSize={11}
                  fill="#111"
                  pointerEvents="none"
                >
                  {c.id} · {c.type}
                </text>
              </g>
            ))}
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

function controlStyle(type: string): { fill: string; stroke: string; strokeWidth: number } {
  const t = type.toLowerCase();
  if (/button/.test(t)) return { fill: '#6366f180', stroke: '#6366f1', strokeWidth: 1.5 };
  if (/label|text/.test(t)) return { fill: '#94a3b830', stroke: '#94a3b8', strokeWidth: 1 };
  if (/input|textinput|edit/.test(t)) return { fill: '#fbbf2430', stroke: '#f59e0b', strokeWidth: 1.5 };
  if (/gallery|listbox/.test(t)) return { fill: '#22c55e25', stroke: '#22c55e', strokeWidth: 1.5 };
  if (/image|icon/.test(t)) return { fill: '#ec489925', stroke: '#ec4899', strokeWidth: 1 };
  if (/group|container/.test(t)) return { fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1 };
  return { fill: '#e2e8f060', stroke: '#cbd5e1', strokeWidth: 1 };
}

function sanitizeIdForAnnotation(raw: string): string {
  // Truncate + filter (la regex Zod impose /^[a-zA-Z0-9_\-.]{1,128}$/)
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 128);
  return cleaned || 'unknown';
}

function clampCoord(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.round(n)));
}
