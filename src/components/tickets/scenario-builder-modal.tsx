'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GitFork,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  ListOrdered,
  Save,
  X,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScenarioFlowPreview } from './scenario-flow-preview';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import type { ScenarioStep } from '@/lib/validations/tickets';

/**
 * ScenarioBuilderModal — Dialog plein écran split 40/60.
 *
 * Panneau gauche (source de vérité) : éditeur liste + réorg ↑↓ + toggle
 * condition + champs expression/logic/true_next/false_next + Textarea pour
 * le commentaire markdown.
 *
 * Panneau droit : ScenarioFlowPreview dérivé via useDebouncedValue(150ms).
 *
 * État local = copie des steps passés en prop initiale. Pas de commit DB
 * avant onConfirm (le caller décide). Re-normalise les index [1..N] à la
 * validation pour éviter les trous et recalculer true_next/false_next si
 * un step référencé a été supprimé.
 */

const MAX_STEPS = 20;

interface ScenarioBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: readonly ScenarioStep[];
  onConfirm: (steps: ScenarioStep[]) => void;
  /** Catégorie du ticket parent pour adapter le label "bug" vs "feature". */
  category?: 'bug' | 'feature' | 'support' | 'maintenance';
}

export function ScenarioBuilderModal({
  open,
  onOpenChange,
  initial,
  onConfirm,
  category = 'support',
}: ScenarioBuilderModalProps) {
  const t = useTranslations('scenario');
  const [steps, setSteps] = useState<ScenarioStep[]>(() =>
    initial.length > 0 ? deepCloneSteps(initial) : [{ index: 1, text: '' }],
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(
    initial.length > 0 ? initial[0].index : 1,
  );
  const [error, setError] = useState<string | null>(null);

  const debouncedSteps = useDebouncedValue(steps, 150);

  const scenarioTitle = useMemo(() => {
    if (category === 'bug') return t('titleBug');
    if (category === 'feature') return t('titleFeature');
    return t('titleDefault');
  }, [category, t]);

  const selected = steps.find((s) => s.index === selectedIndex) ?? steps[0];

  const reIndex = useCallback((arr: ScenarioStep[]): ScenarioStep[] => {
    // Ré-indexe 1..N en préservant les refs true_next/false_next + parent_index
    // relatives. On mappe l'ancien index vers le nouveau via l'ordre courant
    // du tableau.
    const oldToNew = new Map<number, number>();
    arr.forEach((s, i) => oldToNew.set(s.index, i + 1));
    const rewriteRef = (ref: number | null | undefined): number | null | undefined => {
      if (ref == null) return ref;
      return oldToNew.get(ref) ?? null;
    };
    return arr.map((s, i) => {
      const next: ScenarioStep = { ...s, index: i + 1 };
      if (next.condition && next.condition.type === 'if') {
        next.condition = {
          ...next.condition,
          true_next: rewriteRef(next.condition.true_next),
          false_next: rewriteRef(next.condition.false_next),
        };
      }
      if (next.parent_index != null) {
        next.parent_index = rewriteRef(next.parent_index);
      }
      return next;
    });
  }, []);

  const addStep = () => {
    if (steps.length >= MAX_STEPS) {
      setError(t('maxStepsReached', { max: MAX_STEPS }));
      return;
    }
    setError(null);
    setSteps((prev) => {
      const next = [...prev, { index: prev.length + 1, text: '' }];
      return reIndex(next);
    });
    setSelectedIndex(steps.length + 1);
  };

  const removeStep = (stepIndex: number) => {
    if (steps.length <= 1) {
      setError(t('atLeastOneStep'));
      return;
    }
    setError(null);
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.index !== stepIndex);
      const reindexed = reIndex(filtered);
      return reindexed;
    });
    if (selectedIndex === stepIndex && steps.length > 1) {
      setSelectedIndex(1);
    }
  };

  const moveStep = (stepIndex: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const pos = prev.findIndex((s) => s.index === stepIndex);
      const target = pos + direction;
      if (pos < 0 || target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[pos], copy[target]] = [copy[target], copy[pos]];
      return reIndex(copy);
    });
  };

  const updateStep = (stepIndex: number, patch: Partial<ScenarioStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.index === stepIndex ? { ...s, ...patch } : s)),
    );
  };

  const toggleCondition = (stepIndex: number) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.index !== stepIndex) return s;
        if (s.condition) {
          const { condition: _dropped, ...rest } = s;
          return rest;
        }
        return {
          ...s,
          condition: {
            type: 'if',
            expression: '',
            logic: 'and',
            true_next: null,
            false_next: null,
          },
        };
      }),
    );
  };

  const updateCondition = (
    stepIndex: number,
    patch: Partial<NonNullable<ScenarioStep['condition']>>,
  ) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.index !== stepIndex) return s;
        if (!s.condition || s.condition.type !== 'if') return s;
        return {
          ...s,
          condition: { ...s.condition, ...patch },
        };
      }),
    );
  };

  const handleConfirm = () => {
    // Validation locale minimale : chaque step doit avoir un text, chaque
    // condition doit avoir une expression. Le .refine() Zod côté serveur
    // validera le reste (refs in-range, cycles).
    for (const s of steps) {
      if (s.text.trim().length === 0) {
        setError(t('stepTextRequired', { index: s.index }));
        return;
      }
      if (s.condition && s.condition.type === 'if') {
        if (s.condition.expression.trim().length === 0) {
          setError(t('conditionExpressionRequired', { index: s.index }));
          return;
        }
      }
    }
    setError(null);
    onConfirm(steps);
    onOpenChange(false);
  };

  const otherSteps = steps.filter((s) => s.index !== selected?.index);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[96vw] !w-[96vw] !h-[88vh] sm:!max-w-[96vw] p-0 gap-0 overflow-hidden flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="px-5 py-3.5 border-b border-border shrink-0 flex-row items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center shrink-0">
            <ListOrdered className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-[15px]">{scenarioTitle}</DialogTitle>
            <DialogDescription className="text-[13px] text-foreground-subtle">
              {t('description')}
            </DialogDescription>
          </div>
          <span className="text-[12px] font-mono text-foreground-subtle tabular-nums shrink-0">
            {steps.length}/{MAX_STEPS}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          <PanelGroup orientation="horizontal" className="h-full">
            {/* ─── Panneau édition (source of truth) ───────────────────── */}
            <Panel defaultSize="42%" minSize="30%">
              <div className="h-full flex flex-col bg-canvas">
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {steps.map((s) => {
                    const isSelected = s.index === selectedIndex;
                    const isCondition = s.condition?.type === 'if';
                    return (
                      <div
                        key={s.index}
                        className={cn(
                          'rounded-lg border transition-all bg-elevated',
                          isSelected
                            ? 'border-primary/50 ring-1 ring-primary/25'
                            : 'border-border hover:border-border-strong',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedIndex(s.index)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left"
                        >
                          <span
                            className={cn(
                              'inline-flex items-center justify-center w-6 h-6 rounded-md text-[12px] font-semibold tabular-nums',
                              isCondition
                                ? 'bg-[oklch(0.795_0.155_80)]/20 ring-1 ring-[oklch(0.795_0.155_80)]/40 text-[oklch(0.795_0.155_80)]'
                                : 'bg-primary/15 ring-1 ring-primary/30 text-primary',
                            )}
                          >
                            {s.index}
                          </span>
                          <span className="flex-1 min-w-0 text-[13px] text-foreground truncate">
                            {s.text || <em className="text-foreground-subtle">{t('stepUntitled')}</em>}
                          </span>
                          {isCondition && (
                            <GitFork className="w-3.5 h-3.5 text-[oklch(0.795_0.155_80)] shrink-0" />
                          )}
                          {typeof s.comment === 'string' && s.comment.trim().length > 0 && (
                            <MessageSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                          )}
                        </button>
                        {isSelected && (
                          <StepEditor
                            step={s}
                            otherSteps={otherSteps}
                            onUpdate={(patch) => updateStep(s.index, patch)}
                            onToggleCondition={() => toggleCondition(s.index)}
                            onUpdateCondition={(patch) => updateCondition(s.index, patch)}
                            onMoveUp={() => moveStep(s.index, -1)}
                            onMoveDown={() => moveStep(s.index, 1)}
                            onRemove={() => removeStep(s.index)}
                            canMoveUp={steps.findIndex((x) => x.index === s.index) > 0}
                            canMoveDown={
                              steps.findIndex((x) => x.index === s.index) <
                              steps.length - 1
                            }
                            canRemove={steps.length > 1}
                          />
                        )}
                      </div>
                    );
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addStep}
                    disabled={steps.length >= MAX_STEPS}
                    className="w-full h-10 border-dashed gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('addStep')}
                    <span className="text-[12px] text-foreground-subtle tabular-nums ml-1">
                      {steps.length}/{MAX_STEPS}
                    </span>
                  </Button>
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/40 transition-colors cursor-col-resize" />

            {/* ─── Panneau preview ReactFlow ──────────────────────────── */}
            <Panel defaultSize="58%" minSize="40%">
              <div className="h-full bg-canvas relative">
                <ScenarioFlowPreview
                  steps={debouncedSteps}
                  animated
                  interactive
                  emptyMessage={t('emptyPreview')}
                />
              </div>
            </Panel>
          </PanelGroup>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-elevated/40 shrink-0 flex items-center gap-3">
          {error ? (
            <div className="flex items-center gap-2 text-[13px] text-destructive">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </div>
          ) : (
            <p className="text-[13px] text-foreground-subtle">
              {t('footerHint')}
            </p>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              className="gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              {t('confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepEditor({
  step,
  otherSteps,
  onUpdate,
  onToggleCondition,
  onUpdateCondition,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
  canRemove,
}: {
  step: ScenarioStep;
  otherSteps: ScenarioStep[];
  onUpdate: (patch: Partial<ScenarioStep>) => void;
  onToggleCondition: () => void;
  onUpdateCondition: (patch: Partial<NonNullable<ScenarioStep['condition']>>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
}) {
  const t = useTranslations('scenario');
  const isCondition = step.condition?.type === 'if';

  // Liste des parents possibles : tout autre step avec index < celui-ci par
  // défaut, élargi à tous pour permettre des flows non strictement séquentiels.
  const parentCandidates = otherSteps;

  /**
   * Pour un parent candidat donné, détermine quel libellé afficher dans le
   * Select. Si le parent est une condition et que ce step est son true_next
   * ou false_next, on affiche "Étape N (branche SI/SINON)" pour lever
   * l'ambiguïté côté UX.
   */
  const parentLabel = (parent: ScenarioStep): string => {
    const base = parent.text
      ? t('parentStepWithText', { index: parent.index, text: truncate(parent.text, 40) })
      : t('parentStep', { index: parent.index });
    const c = parent.condition;
    if (c && c.type === 'if') {
      if (c.true_next === step.index) return `${base} · ${t('parentBranchIf')}`;
      if (c.false_next === step.index) return `${base} · ${t('parentBranchElse')}`;
    }
    return base;
  };

  return (
    <div className="border-t border-border/60 px-3 py-3 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`step-text-${step.index}`} className="text-[12px] text-foreground-muted">
          {t('stepLabel')}
        </Label>
        <Input
          id={`step-text-${step.index}`}
          value={step.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder={isCondition ? t('stepPlaceholderCondition') : t('stepPlaceholderStep')}
          className="bg-canvas dark:bg-canvas h-9"
          maxLength={500}
        />
      </div>

      {step.index > 1 && (
        <div className="space-y-1.5">
          <Label className="text-[12px] text-foreground-muted">
            {t('parentLabel')}
            <span className="ml-1 text-foreground-subtle">{t('parentLabelHint')}</span>
          </Label>
          <Select
            value={step.parent_index != null ? String(step.parent_index) : 'none'}
            onValueChange={(v) =>
              onUpdate({ parent_index: v === 'none' ? null : Number(v) })
            }
          >
            <SelectTrigger className="bg-canvas dark:bg-canvas h-9">
              <SelectValue placeholder={t('parentAutoLabel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('parentAutoDash')}</SelectItem>
              {parentCandidates.map((p) => (
                <SelectItem key={p.index} value={String(p.index)}>
                  {parentLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          variant={isCondition ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleCondition}
          className="gap-2"
        >
          <GitFork className="w-3.5 h-3.5" />
          {isCondition ? t('removeCondition') : t('addCondition')}
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onMoveUp} disabled={!canMoveUp} aria-label={t('moveUp')}>
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onMoveDown} disabled={!canMoveDown} aria-label={t('moveDown')}>
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label={t('remove')}
            className="hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isCondition && step.condition && step.condition.type === 'if' && (
        <div className="space-y-2.5 rounded-md border border-[oklch(0.795_0.155_80)]/30 bg-[oklch(0.795_0.155_80)]/5 p-3">
          <div className="space-y-1.5">
            <Label
              htmlFor={`cond-expr-${step.index}`}
              className="text-[12px] text-foreground-muted flex items-center gap-1.5"
            >
              <GitFork className="w-3 h-3 text-[oklch(0.795_0.155_80)]" />
              {t('conditionExpression')}
            </Label>
            <Input
              id={`cond-expr-${step.index}`}
              value={step.condition.expression}
              onChange={(e) => onUpdateCondition({ expression: e.target.value })}
              placeholder={t('conditionExpressionPlaceholder')}
              className="bg-canvas dark:bg-canvas h-9 font-mono text-[13px]"
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-foreground-muted">{t('logic')}</Label>
              <Select
                value={step.condition.logic ?? 'and'}
                onValueChange={(v) => onUpdateCondition({ logic: v as 'and' | 'or' })}
              >
                <SelectTrigger className="bg-canvas dark:bg-canvas h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="and">{t('logicAnd')}</SelectItem>
                  <SelectItem value="or">{t('logicOr')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-foreground-muted">{t('branchIf')}</Label>
              <Select
                value={step.condition.true_next != null ? String(step.condition.true_next) : 'none'}
                onValueChange={(v) =>
                  onUpdateCondition({ true_next: v === 'none' ? null : Number(v) })
                }
              >
                <SelectTrigger className="bg-canvas dark:bg-canvas h-9">
                  <SelectValue placeholder={t('branchChoose')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('branchNone')}</SelectItem>
                  {otherSteps.map((o) => (
                    <SelectItem key={o.index} value={String(o.index)}>
                      {t('parentStep', { index: o.index })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-foreground-muted">{t('branchElse')}</Label>
              <Select
                value={step.condition.false_next != null ? String(step.condition.false_next) : 'none'}
                onValueChange={(v) =>
                  onUpdateCondition({ false_next: v === 'none' ? null : Number(v) })
                }
              >
                <SelectTrigger className="bg-canvas dark:bg-canvas h-9">
                  <SelectValue placeholder={t('branchChoose')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('branchNone')}</SelectItem>
                  {otherSteps.map((o) => (
                    <SelectItem key={o.index} value={String(o.index)}>
                      {t('parentStep', { index: o.index })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label
          htmlFor={`step-comment-${step.index}`}
          className="text-[12px] text-foreground-muted flex items-center gap-1.5"
        >
          <MessageSquare className="w-3 h-3" />
          {t('comment')}
        </Label>
        <Textarea
          id={`step-comment-${step.index}`}
          value={step.comment ?? ''}
          onChange={(e) => onUpdate({ comment: e.target.value || null })}
          placeholder={t('commentPlaceholder')}
          className="bg-canvas dark:bg-canvas text-[13px] min-h-[72px]"
          maxLength={5000}
        />
        <p className="text-[12px] text-foreground-subtle tabular-nums text-right">
          {(step.comment ?? '').length} / 5000
        </p>
      </div>
    </div>
  );
}

function deepCloneSteps(steps: readonly ScenarioStep[]): ScenarioStep[] {
  return steps.map((s) => ({
    ...s,
    condition: s.condition ? { ...s.condition } : s.condition,
  }));
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
