'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Loader2, AlertTriangle, ChevronRight, ChevronDown,
  Database, Workflow, FileCode, Shield, Puzzle, Folder,
} from 'lucide-react';
import type { SolutionManifest } from '@/modules/projects/lib/preview/solution';
import type { PreviewAnnotation } from '@/modules/projects/lib/annotation-schema';
import { AnnotationToTicketModal } from '@/modules/projects/components/annotation-to-ticket-modal';

type Status = 'loading' | 'ready' | 'error' | 'not_ready';

function groupIcon(type: string): React.ReactNode {
  if (type === 'Entity') return <Database className="w-3.5 h-3.5" />;
  if (type === 'Workflow') return <Workflow className="w-3.5 h-3.5" />;
  if (type === 'WebResource') return <FileCode className="w-3.5 h-3.5" />;
  if (type === 'Role') return <Shield className="w-3.5 h-3.5" />;
  if (type === 'Plugin') return <Puzzle className="w-3.5 h-3.5" />;
  return <Folder className="w-3.5 h-3.5" />;
}

function sanitizeIdForAnnotation(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 128);
  return cleaned || 'unknown';
}

export function SolutionTreeViewer({
  deliverableId,
  projectId,
  annotationEnabled = false,
}: {
  deliverableId: string;
  projectId?: string;
  annotationEnabled?: boolean;
}) {
  const t = useTranslations('projects.preview');
  const [manifest, setManifest] = useState<SolutionManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
        const m = (await res.json()) as SolutionManifest;
        setManifest(m);
        // Expand the first group by default
        if (m.groups.length > 0) setExpanded(new Set([m.groups[0].type]));
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

  const toggleGroup = (type: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const handleItemClick = (groupType: string, item: { id: string; name: string }) => {
    if (!annotationEnabled || !projectId) return;
    setSelectedAnnotation({
      type: 'solution',
      deliverable_id: deliverableId,
      component_type: sanitizeIdForAnnotation(groupType),
      component_id: sanitizeIdForAnnotation(item.id),
    });
  };

  const headerStats = useMemo(() => {
    if (!manifest) return null;
    return t('solutionStats', { components: manifest.metadata.totalComponents, types: manifest.groups.length });
  }, [manifest, t]);

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
      <div className="border-b border-border px-4 py-3 bg-elevated/30">
        <div className="text-sm font-semibold">{manifest.solutionName}</div>
        <div className="text-xs text-foreground-muted mt-0.5">
          v{manifest.solutionVersion}
          {manifest.publisher && <> · <span className="italic">{manifest.publisher}</span></>}
          {' · '}{headerStats}
        </div>
      </div>

      {annotationEnabled && projectId && (
        <div className="px-4 py-1.5 text-xs text-foreground-muted border-b border-border bg-elevated/30">
          {t('clickComponentHint')}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <ul className="space-y-1">
          {manifest.groups.map((group) => {
            const isOpen = expanded.has(group.type);
            return (
              <li key={group.type}>
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-elevated/60 text-sm transition text-left"
                  onClick={() => toggleGroup(group.type)}
                >
                  {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                  {groupIcon(group.type)}
                  <span className="font-medium">{group.type}</span>
                  <span className="text-foreground-muted text-xs">({group.items.length})</span>
                </button>
                {isOpen && (
                  <ul className="ml-6 mt-1 space-y-0.5 border-l border-border pl-3">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <button
                          className={`w-full text-left px-2 py-1 rounded-md text-xs hover:bg-elevated/60 transition ${annotationEnabled ? 'cursor-pointer' : 'cursor-default'}`}
                          onClick={() => handleItemClick(group.type, item)}
                          disabled={!annotationEnabled}
                        >
                          <span className="text-foreground">{item.displayName || item.name}</span>
                          {item.displayName && item.displayName !== item.name && (
                            <span className="text-foreground-muted ml-2">· {item.name}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {manifest.metadata.parseWarnings.length > 0 && (
          <div className="mt-4 p-2 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs text-amber-600">
            <div className="font-medium mb-1">{t('parserWarnings')}</div>
            <ul className="list-disc list-inside space-y-0.5">
              {manifest.metadata.parseWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
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
