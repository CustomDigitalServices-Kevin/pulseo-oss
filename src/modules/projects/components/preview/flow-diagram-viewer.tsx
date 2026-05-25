'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, type NodeMouseHandler, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { FlowManifest } from '@/modules/projects/lib/preview/flow';
import type { PreviewAnnotation } from '@/modules/projects/lib/annotation-schema';
import { AnnotationToTicketModal } from '@/modules/projects/components/annotation-to-ticket-modal';

/**
 * FlowDiagramViewer — rend un manifest Flow Power Automate en diagramme
 * interactif via React Flow. Layout automatique simple (grid vertical).
 *
 * Le manifest est fetch depuis /api/projects/deliverables/[id]/preview-manifest
 * (IDOR + fail-closed côté serveur).
 */
export function FlowDiagramViewer({
  deliverableId,
  projectId,
  annotationEnabled = false,
}: {
  deliverableId: string;
  projectId?: string;
  annotationEnabled?: boolean;
}) {
  const t = useTranslations('projects.preview');
  const [manifest, setManifest] = useState<FlowManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'not_ready'>('loading');
  const [selectedAnnotation, setSelectedAnnotation] = useState<PreviewAnnotation | null>(null);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_e, node) => {
      if (!annotationEnabled || !projectId) return;
      setSelectedAnnotation({
        type: 'flow',
        deliverable_id: deliverableId,
        node_id: node.id,
      });
    },
    [annotationEnabled, deliverableId, projectId],
  );

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
        const m = (await res.json()) as FlowManifest;
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

  const { nodes, edges } = useMemo(() => layoutManifest(manifest), [manifest]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-foreground-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('loadingManifest')}
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
          <p className="mt-2 text-xs text-foreground-subtle">
            {t('reloadHint')}
          </p>
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
    <div className="h-full w-full relative" style={{ background: 'var(--background-subtle)' }}>
      {annotationEnabled && projectId && (
        <div className="absolute top-2 right-2 z-10 rounded-md bg-elevated/90 backdrop-blur px-3 py-1.5 text-xs text-foreground-muted border border-border">
          {t('clickNodeHint')}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={onNodeClick}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
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

/**
 * Layout trivial vertical : triggers en haut, actions en colonnes successives
 * par profondeur (BFS depuis les triggers via runAfter). Suffisant MVP —
 * layout plus sophistiqué (dagre/ELK) en P5+ si besoin.
 */
function layoutManifest(manifest: FlowManifest | null): { nodes: Node[]; edges: Edge[] } {
  if (!manifest) return { nodes: [], edges: [] };

  const depthById = new Map<string, number>();
  // Triggers = depth 0
  for (const n of manifest.nodes) {
    if (n.kind === 'trigger') depthById.set(n.id, 0);
  }
  // BFS via edges
  let changed = true;
  let iter = 0;
  while (changed && iter < 50) {
    changed = false;
    iter++;
    for (const e of manifest.edges) {
      const ds = depthById.get(e.source);
      if (ds === undefined) continue;
      const dt = depthById.get(e.target);
      if (dt === undefined || dt <= ds) {
        depthById.set(e.target, ds + 1);
        changed = true;
      }
    }
  }
  // Unconnected nodes → depth by position
  let i = 0;
  for (const n of manifest.nodes) {
    if (!depthById.has(n.id)) {
      depthById.set(n.id, manifest.edges.length === 0 ? i : 0);
      i++;
    }
  }

  // Positionne par colonnes (depth) et slots dans la colonne
  const byDepth = new Map<number, string[]>();
  for (const n of manifest.nodes) {
    const d = depthById.get(n.id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n.id);
  }

  const NODE_W = 220;
  const NODE_H = 80;
  const V_GAP = 60;
  const H_GAP = 80;

  const pos = new Map<string, { x: number; y: number }>();
  for (const [depth, ids] of byDepth) {
    ids.forEach((id, idx) => {
      pos.set(id, {
        x: idx * (NODE_W + H_GAP),
        y: depth * (NODE_H + V_GAP),
      });
    });
  }

  const rfNodes: Node[] = manifest.nodes.map((n) => ({
    id: n.id,
    position: pos.get(n.id) ?? { x: 0, y: 0 },
    data: { label: formatNodeLabel(n) },
    type: n.kind === 'trigger' ? 'input' : 'default',
    style: nodeStyle(n),
  }));

  const rfEdges: Edge[] = manifest.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.statuses?.some((s) => s === 'Failed' || s === 'TimedOut') ?? false,
    label: e.statuses?.length && !(e.statuses.length === 1 && e.statuses[0] === 'Succeeded')
      ? e.statuses.join('/')
      : undefined,
    labelStyle: { fontSize: 10 },
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

function formatNodeLabel(n: { label: string; type: string; kind: string }): string {
  return `${n.label}\n— ${n.type}`;
}

function nodeStyle(n: { kind: 'trigger' | 'action'; type: string }): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 220,
    padding: 8,
    border: '1px solid',
    borderRadius: 6,
    fontSize: 12,
    textAlign: 'center',
    whiteSpace: 'pre-line',
  };
  if (n.kind === 'trigger') {
    return { ...base, background: '#10b98122', borderColor: '#10b981' };
  }
  if (/condition|switch/i.test(n.type)) {
    return { ...base, background: '#f59e0b22', borderColor: '#f59e0b' };
  }
  return { ...base, background: 'var(--elevated)', borderColor: 'var(--border)' };
}
