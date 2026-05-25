import type { ScenarioStep } from '@/lib/validations/tickets';

/**
 * Représentation graphe dérivée de `scenario_steps` pour rendu ReactFlow.
 *
 * Règles :
 * - Un step sans `condition` produit un `StepNode` et une edge vers `index+1`
 *   si le step suivant existe dans l'array (sauf si un prédécesseur pointe
 *   déjà sur lui via `true_next`/`false_next`).
 * - Un step avec `condition.type === 'if'` produit un `ConditionNode` et
 *   deux edges : `label="SI"` vers `true_next`, `label="SINON"` vers
 *   `false_next`. Si l'une des cibles est absente, l'edge est omise (le
 *   composant affichera un style "fin de branche").
 * - Layout BFS depth-based : racine = premier step (index min), depth+1
 *   pour chaque target d'edge. Positions calculées en grille (x = colonne
 *   dans le depth, y = depth). Cohérent avec `flow-diagram-viewer.tsx`.
 */

export type ScenarioGraphNode = {
  id: string; // `step-<index>`
  type: 'step' | 'condition';
  position: { x: number; y: number };
  data: {
    index: number;
    text: string;
    hasComment: boolean;
    condition?: {
      expression: string;
      logic: 'and' | 'or';
    };
  };
};

export type ScenarioGraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: 'SI' | 'SINON';
  kind: 'linear' | 'true' | 'false';
};

export type ScenarioGraph = {
  nodes: ScenarioGraphNode[];
  edges: ScenarioGraphEdge[];
};

const NODE_W = 220;
const NODE_H = 80;
const H_GAP = 60;
const V_GAP = 80;

/**
 * Retourne le graphe {nodes, edges} pour rendu ReactFlow. Fonction pure,
 * memoizable côté caller.
 *
 * L'entrée `steps` est supposée validée par `scenarioStepsArraySchema`
 * (indices uniques, refs in-range, pas d'auto-ref). Les cas dégénérés
 * (array vide, step isolé) retournent un graphe vide ou minimal sans
 * throw.
 */
export function stepsToGraph(steps: readonly ScenarioStep[]): ScenarioGraph {
  if (steps.length === 0) return { nodes: [], edges: [] };

  // Map index → step pour lookups O(1)
  const byIndex = new Map<number, ScenarioStep>();
  for (const s of steps) byIndex.set(s.index, s);

  // Détecte les steps ciblés explicitement par une condition (pour ne pas
  // leur ajouter en plus une edge linéaire index-1 → index).
  const reachedByCondition = new Set<number>();
  for (const s of steps) {
    const c = s.condition;
    if (!c || c.type !== 'if') continue;
    if (c.true_next != null) reachedByCondition.add(c.true_next);
    if (c.false_next != null) reachedByCondition.add(c.false_next);
  }

  // Détecte les steps qui ont un parent_index explicite (déjà reliés en
  // amont, pas besoin de linear fallback depuis ce step parent non plus).
  const hasExplicitParent = new Set<number>();
  for (const s of steps) {
    if (s.parent_index != null) hasExplicitParent.add(s.index);
  }

  const sortedByIndex = [...steps].sort((a, b) => a.index - b.index);
  const edges: ScenarioGraphEdge[] = [];
  const pushedEdges = new Set<string>();

  /**
   * Determine la `kind` d'une edge parent → child en fonction de la
   * condition du parent. Si le parent est une condition et que child est
   * pointé par `true_next`/`false_next`, retourne 'true'/'false' avec
   * label SI/SINON. Sinon linear.
   */
  const kindOf = (
    parent: ScenarioStep,
    childIndex: number,
  ): { kind: ScenarioGraphEdge['kind']; label?: 'SI' | 'SINON' } => {
    const c = parent.condition;
    if (c && c.type === 'if') {
      if (c.true_next === childIndex) return { kind: 'true', label: 'SI' };
      if (c.false_next === childIndex) return { kind: 'false', label: 'SINON' };
    }
    return { kind: 'linear' };
  };

  const pushEdge = (
    parentIndex: number,
    childIndex: number,
    kind: ScenarioGraphEdge['kind'],
    label: ScenarioGraphEdge['label'],
  ) => {
    const id = `step-${parentIndex}-${kind}-step-${childIndex}`;
    if (pushedEdges.has(id)) return;
    pushedEdges.add(id);
    edges.push({
      id,
      source: `step-${parentIndex}`,
      target: `step-${childIndex}`,
      label,
      kind,
    });
  };

  // 1) Edges explicites depuis condition.true_next / condition.false_next
  for (const s of sortedByIndex) {
    const c = s.condition;
    if (!c || c.type !== 'if') continue;
    if (c.true_next != null && byIndex.has(c.true_next)) {
      pushEdge(s.index, c.true_next, 'true', 'SI');
    }
    if (c.false_next != null && byIndex.has(c.false_next)) {
      pushEdge(s.index, c.false_next, 'false', 'SINON');
    }
  }

  // 2) Edges explicites depuis parent_index
  for (const s of sortedByIndex) {
    if (s.parent_index == null) continue;
    const parent = byIndex.get(s.parent_index);
    if (!parent) continue;
    const { kind, label } = kindOf(parent, s.index);
    pushEdge(parent.index, s.index, kind, label);
  }

  // 3) Linear fallback : seulement pour les steps sans parent_index et non
  //    atteints par une condition d'un autre step. Seul un step source
  //    sans condition émet un fallback (les conditions sans true_next/
  //    false_next restent "dangling" — gérées par un badge visuel côté UI
  //    plus tard si nécessaire).
  for (let i = 0; i < sortedByIndex.length - 1; i++) {
    const s = sortedByIndex[i];
    const next = sortedByIndex[i + 1];
    if (s.condition?.type === 'if') continue;
    if (hasExplicitParent.has(next.index)) continue;
    if (reachedByCondition.has(next.index)) continue;
    pushEdge(s.index, next.index, 'linear', undefined);
  }

  // Layout BFS depth-based. Depth 0 = premier step par index. Les steps non
  // reliés (orphans) reçoivent un depth incrémental pour tomber en bas du
  // diagramme sans chevauchement.
  const depthById = new Map<string, number>();
  const firstId = `step-${sortedByIndex[0].index}`;
  depthById.set(firstId, 0);
  let changed = true;
  let iter = 0;
  while (changed && iter < 50) {
    changed = false;
    iter++;
    for (const e of edges) {
      const ds = depthById.get(e.source);
      if (ds === undefined) continue;
      const dt = depthById.get(e.target);
      if (dt === undefined || dt <= ds) {
        depthById.set(e.target, ds + 1);
        changed = true;
      }
    }
  }
  let fallback = 0;
  for (const s of sortedByIndex) {
    const id = `step-${s.index}`;
    if (!depthById.has(id)) {
      depthById.set(id, sortedByIndex.length + fallback);
      fallback++;
    }
  }

  // Grouper par depth pour positionner en grille
  const byDepth = new Map<number, string[]>();
  for (const s of sortedByIndex) {
    const id = `step-${s.index}`;
    const d = depthById.get(id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  const nodePos = new Map<string, { x: number; y: number }>();
  for (const [depth, ids] of byDepth) {
    ids.forEach((id, col) => {
      nodePos.set(id, {
        x: col * (NODE_W + H_GAP),
        y: depth * (NODE_H + V_GAP),
      });
    });
  }

  const nodes: ScenarioGraphNode[] = sortedByIndex.map((s) => {
    const id = `step-${s.index}`;
    const isCondition = s.condition?.type === 'if';
    return {
      id,
      type: isCondition ? 'condition' : 'step',
      position: nodePos.get(id) ?? { x: 0, y: 0 },
      data: {
        index: s.index,
        text: s.text,
        hasComment: typeof s.comment === 'string' && s.comment.trim().length > 0,
        condition:
          isCondition && s.condition && s.condition.type === 'if'
            ? {
                expression: s.condition.expression,
                logic: s.condition.logic ?? 'and',
              }
            : undefined,
      },
    };
  });

  return { nodes, edges };
}
