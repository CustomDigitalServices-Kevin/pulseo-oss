'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { stepsToGraph, type ScenarioGraphEdge } from '@/lib/tickets/scenario-graph';
import { scenarioNodeTypes, type ScenarioStepNode, type ScenarioConditionNode } from './scenario-nodes';
import type { ScenarioStep } from '@/lib/validations/tickets';

/**
 * Preview ReactFlow read-only du scénario d'étapes. Consomme directement un
 * array `scenario_steps` validé et calcule le graphe via `stepsToGraph`.
 *
 * Edge custom `animated` = `AnimatedDotEdge` (flux de points se déplaçant
 * lentement le long du tracé via SVG <animateMotion>, duration 2.4s). Edge
 * `true` / `false` = statique, label "SI" / "SINON", couleur success /
 * destructive distincte.
 *
 * proOptions.hideAttribution: OK license MIT @xyflow/react (cohérent
 * FlowDiagramViewer P5).
 */

const EDGE_COLORS = {
  linear: 'oklch(0.625 0.205 264)', // primary
  true: 'oklch(0.700 0.165 155)', // success vert
  false: 'oklch(0.685 0.205 25)', // destructive rouge
} as const;

type ScenarioEdgeData = {
  kind: ScenarioGraphEdge['kind'];
};

type ScenarioNode = ScenarioStepNode | ScenarioConditionNode;
type ScenarioRfEdge = Edge<ScenarioEdgeData>;

interface ScenarioFlowPreviewProps {
  steps: readonly ScenarioStep[];
  /** Active animations des edges linear (dot qui circule). Défaut true. */
  animated?: boolean;
  className?: string;
  emptyMessage?: string;
  /**
   * Active le pan par drag (déplacement dans le graph avec la souris). Défaut
   * false (previews fixes, modal aperçu sidebar, fullscreen). À activer dans
   * le modal builder où l'utilisateur doit pouvoir naviguer.
   */
  interactive?: boolean;
}

export function ScenarioFlowPreview({
  steps,
  animated = true,
  className,
  emptyMessage,
  interactive = false,
}: ScenarioFlowPreviewProps) {
  const t = useTranslations('ticket');
  const resolvedEmpty = emptyMessage ?? t('scenarioEmpty');
  const { nodes, edges } = useMemo<{
    nodes: ScenarioNode[];
    edges: ScenarioRfEdge[];
  }>(() => {
    const graph = stepsToGraph(steps);
    const rfNodes: ScenarioNode[] = graph.nodes.map((n) => {
      if (n.type === 'condition' && n.data.condition) {
        return {
          id: n.id,
          type: 'condition',
          position: n.position,
          data: {
            index: n.data.index,
            text: n.data.text,
            hasComment: n.data.hasComment,
            condition: n.data.condition,
          },
        } satisfies ScenarioConditionNode;
      }
      return {
        id: n.id,
        type: 'step',
        position: n.position,
        data: {
          index: n.data.index,
          text: n.data.text,
          hasComment: n.data.hasComment,
        },
      } satisfies ScenarioStepNode;
    });

    const rfEdges: ScenarioRfEdge[] = graph.edges.map((e) => {
      const color = EDGE_COLORS[e.kind];
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.kind === 'true' ? 'true' : e.kind === 'false' ? 'false' : undefined,
        type: e.kind === 'linear' && animated ? 'animatedDot' : 'default',
        label: e.label,
        labelStyle: { fontSize: 11, fontWeight: 600, fill: color },
        labelBgStyle: { fill: 'var(--elevated)' },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        style: {
          stroke: color,
          strokeWidth: 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 16,
          height: 16,
        },
        data: { kind: e.kind },
      };
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [steps, animated]);

  const edgeTypes = useMemo(
    () => ({
      animatedDot: AnimatedDotEdge,
    }),
    [],
  );

  if (nodes.length === 0) {
    return (
      <div
        className={
          'flex items-center justify-center h-full text-[13px] text-foreground-subtle italic ' +
          (className ?? '')
        }
      >
        {resolvedEmpty}
      </div>
    );
  }

  return (
    <div
      className={'h-full w-full relative ' + (className ?? '')}
      style={{
        background: 'var(--canvas)',
        // Override CSS vars React Flow Controls pour alignement dark tokens
        // Pulseo. Défaut lib = fond blanc / icônes sombres (invisibles en
        // dark mode). Source: https://reactflow.dev/api-reference/components/controls
        ['--xy-controls-button-background-color' as string]: 'var(--elevated)',
        ['--xy-controls-button-background-color-hover' as string]: 'var(--overlay)',
        ['--xy-controls-button-color' as string]: 'var(--foreground)',
        ['--xy-controls-button-color-hover' as string]: 'var(--primary)',
        ['--xy-controls-button-border-color' as string]: 'var(--border)',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={scenarioNodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={interactive}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="oklch(1 0 0 / 0.04)" />
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="!rounded-md !shadow-premium-sm !overflow-hidden"
        />
      </ReactFlow>
    </div>
  );
}

/**
 * Edge custom : tracé bezier standard + un petit point SVG animé via
 * <animateMotion> qui circule du source vers le target en 2.4s. Rendu GPU
 * via transform, évite le pattern stroke-dashoffset CSS (plus coûteux sur
 * 20 edges selon docs React Flow).
 */
function AnimatedDotEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    label,
    labelStyle,
    labelBgStyle,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const stroke = (style?.stroke as string | undefined) ?? EDGE_COLORS.linear;

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        markerEnd={typeof markerEnd === 'string' ? markerEnd : undefined}
      />
      <circle r={3} fill={stroke} opacity={0.85}>
        <animateMotion
          dur="2.4s"
          repeatCount="indefinite"
          path={edgePath}
          rotate="auto"
        />
      </circle>
      {label != null && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect
            x={-14}
            y={-9}
            width={28}
            height={18}
            rx={4}
            ry={4}
            fill={(labelBgStyle?.fill as string | undefined) ?? 'var(--elevated)'}
          />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: 11, fontWeight: 600, ...(labelStyle ?? {}) }}
          >
            {label as string}
          </text>
        </g>
      )}
    </>
  );
}
