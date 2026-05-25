'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Custom nodes ReactFlow pour le ScenarioFlowPreview.
 *
 * StepNode (rectangle) : step linéaire, affiche l'index + le texte. Icône
 * MessageSquare en coin haut-droit si un commentaire est présent.
 *
 * ConditionNode (losange visuel via un badge en coin + forme rectangle
 * arrondi — un vrai losange pur CSS casse les handles ReactFlow, on choisit
 * un rectangle teinté "warning" avec icône branching). Affiche l'expression,
 * le logic (ET/OU), et l'icône commentaire si présent.
 *
 * Tokens dark Pulseo : bg-elevated, border-border, primary oklch(0.625 0.205
 * 264). Pas de style inline pour garder la cohérence avec le design system.
 */

export type StepNodeData = {
  index: number;
  text: string;
  hasComment: boolean;
};

export type ConditionNodeData = {
  index: number;
  text: string;
  hasComment: boolean;
  condition: {
    expression: string;
    logic: 'and' | 'or';
  };
};

export type ScenarioStepNode = Node<StepNodeData, 'step'>;
export type ScenarioConditionNode = Node<ConditionNodeData, 'condition'>;

export function StepNode({ data, selected }: NodeProps<ScenarioStepNode>) {
  const t = useTranslations('ticket');
  return (
    <div
      className={cn(
        'relative w-[220px] rounded-lg border bg-elevated shadow-premium-sm transition-colors',
        selected
          ? 'border-primary ring-2 ring-primary/30'
          : 'border-border hover:border-border-strong',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-primary/70 !border-none"
      />
      <div className="px-3 pt-2.5 pb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-primary/15 ring-1 ring-primary/30 text-[11px] font-semibold text-primary tabular-nums">
            {data.index}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
            {t('nodeStepLabel')}
          </span>
          {data.hasComment && (
            <MessageSquare
              className="ml-auto w-3.5 h-3.5 text-primary"
              aria-label={t('nodeCommentAria')}
            />
          )}
        </div>
        <p className="text-[13px] leading-snug text-foreground line-clamp-3">
          {data.text}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-primary/70 !border-none"
      />
    </div>
  );
}

export function ConditionNode({ data, selected }: NodeProps<ScenarioConditionNode>) {
  const t = useTranslations('ticket');
  const tScenario = useTranslations('scenario');
  const logicLabel = data.condition.logic === 'or' ? tScenario('logicOr') : tScenario('logicAnd');
  return (
    <div
      className={cn(
        'relative w-[240px] rounded-lg border shadow-premium-sm transition-colors',
        selected
          ? 'border-[oklch(0.795_0.155_80)] ring-2 ring-[oklch(0.795_0.155_80)]/30'
          : 'border-[oklch(0.795_0.155_80)]/45 hover:border-[oklch(0.795_0.155_80)]/70',
      )}
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklch, oklch(0.795 0.155 80) 14%, var(--elevated)), var(--elevated))',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-[oklch(0.795_0.155_80)]/80 !border-none"
      />
      <div className="px-3 pt-2.5 pb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[oklch(0.795_0.155_80)]/20 ring-1 ring-[oklch(0.795_0.155_80)]/40 text-[11px] font-semibold text-[oklch(0.795_0.155_80)] tabular-nums">
            {data.index}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[oklch(0.795_0.155_80)]">
            {t('nodeConditionLabel')}
          </span>
          <span
            className="ml-1 inline-flex items-center px-1.5 h-4 rounded text-[10px] font-bold tabular-nums"
            style={{
              backgroundColor: 'color-mix(in oklch, oklch(0.795 0.155 80) 22%, transparent)',
              color: 'oklch(0.795 0.155 80)',
            }}
            aria-label={t('nodeLogicAria', { logic: logicLabel })}
          >
            {logicLabel}
          </span>
          {data.hasComment && (
            <MessageSquare
              className="ml-auto w-3.5 h-3.5 text-[oklch(0.795_0.155_80)]"
              aria-label={t('nodeCommentAria')}
            />
          )}
        </div>
        <p className="text-[13px] leading-snug text-foreground line-clamp-2">
          {data.text}
        </p>
        <p className="mt-1 text-[12px] font-mono text-foreground-muted line-clamp-2 break-all">
          {data.condition.expression}
        </p>
      </div>
      {/* 2 handles source distincts pour les branches true (gauche) / false
          (droite), permettant des edges visuellement séparées. */}
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        style={{ left: '30%' }}
        className="!w-2 !h-2 !bg-[oklch(0.700_0.165_155)] !border-none"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        style={{ left: '70%' }}
        className="!w-2 !h-2 !bg-[oklch(0.685_0.205_25)] !border-none"
      />
    </div>
  );
}

export const scenarioNodeTypes = {
  step: StepNode,
  condition: ConditionNode,
} as const;
