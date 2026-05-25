import { describe, it, expect } from 'vitest';
import { stepsToGraph } from './scenario-graph';
import type { ScenarioStep } from '@/lib/validations/tickets';

describe('stepsToGraph', () => {
  it('returns empty graph for empty input', () => {
    expect(stepsToGraph([])).toEqual({ nodes: [], edges: [] });
  });

  it('builds linear edges for steps without conditions', () => {
    const steps: ScenarioStep[] = [
      { index: 1, text: 'A' },
      { index: 2, text: 'B' },
      { index: 3, text: 'C' },
    ];
    const { nodes, edges } = stepsToGraph(steps);
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => n.type === 'step')).toBe(true);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ source: 'step-1', target: 'step-2', kind: 'linear' });
    expect(edges[1]).toMatchObject({ source: 'step-2', target: 'step-3', kind: 'linear' });
  });

  it('emits two labelled edges for an if-step with true_next and false_next', () => {
    const steps: ScenarioStep[] = [
      {
        index: 1,
        text: 'Decide',
        condition: {
          type: 'if',
          expression: 'user.role == admin',
          logic: 'and',
          true_next: 2,
          false_next: 3,
        },
      },
      { index: 2, text: 'Admin branch' },
      { index: 3, text: 'Other branch' },
    ];
    const { nodes, edges } = stepsToGraph(steps);
    expect(nodes.find((n) => n.id === 'step-1')?.type).toBe('condition');
    const trueEdge = edges.find((e) => e.kind === 'true');
    const falseEdge = edges.find((e) => e.kind === 'false');
    expect(trueEdge).toMatchObject({ source: 'step-1', target: 'step-2', label: 'SI' });
    expect(falseEdge).toMatchObject({ source: 'step-1', target: 'step-3', label: 'SINON' });
  });

  it('skips linear fallback when next step is reached by a condition branch', () => {
    // Step 1 if → step 3 (true) / step 2 (false). Le linear fallback 1→2
    // ne doit pas être ajouté (doublon avec false branch).
    const steps: ScenarioStep[] = [
      {
        index: 1,
        text: 'Decide',
        condition: { type: 'if', expression: 'x', true_next: 3, false_next: 2 },
      },
      { index: 2, text: 'B' },
      { index: 3, text: 'C' },
    ];
    const { edges } = stepsToGraph(steps);
    const fromStep1 = edges.filter((e) => e.source === 'step-1');
    expect(fromStep1).toHaveLength(2);
    expect(fromStep1.every((e) => e.kind === 'true' || e.kind === 'false')).toBe(true);
  });

  it('flags hasComment when step has non-empty comment', () => {
    const steps: ScenarioStep[] = [
      { index: 1, text: 'A', comment: 'Note longue' },
      { index: 2, text: 'B', comment: '   ' }, // whitespace = no comment
      { index: 3, text: 'C' },
    ];
    const { nodes } = stepsToGraph(steps);
    expect(nodes[0].data.hasComment).toBe(true);
    expect(nodes[1].data.hasComment).toBe(false);
    expect(nodes[2].data.hasComment).toBe(false);
  });

  it('places orphan steps below the main graph without overlap', () => {
    // Step 1 et step 3 connectés, step 2 isolé (pas d'edge entrante ni
    // sortante). Le layout BFS doit placer step 2 en bas sans chevauchement.
    const steps: ScenarioStep[] = [
      {
        index: 1,
        text: 'A',
        condition: { type: 'if', expression: 'x', true_next: 3 },
      },
      { index: 2, text: 'Orphan' },
      { index: 3, text: 'C' },
    ];
    const { nodes } = stepsToGraph(steps);
    const orphan = nodes.find((n) => n.id === 'step-2');
    const c = nodes.find((n) => n.id === 'step-3');
    expect(orphan).toBeDefined();
    expect(c).toBeDefined();
    expect(orphan!.position.y).toBeGreaterThan(c!.position.y);
  });

  it('defaults condition.logic to "and" when absent', () => {
    const steps: ScenarioStep[] = [
      {
        index: 1,
        text: 'X',
        condition: { type: 'if', expression: 'y' },
      },
    ];
    const { nodes } = stepsToGraph(steps);
    expect(nodes[0].data.condition?.logic).toBe('and');
  });

  it('uses parent_index to place a step in a specific branch', () => {
    // Step 1 if → vrai: step 2, faux: step 3.
    // Step 4 a parent_index=2 → doit suivre la branche SI (après step 2).
    // Step 5 a parent_index=3 → doit suivre la branche SINON (après step 3).
    const steps: ScenarioStep[] = [
      {
        index: 1,
        text: 'Decide',
        condition: { type: 'if', expression: 'x', true_next: 2, false_next: 3 },
      },
      { index: 2, text: 'Branche SI' },
      { index: 3, text: 'Branche SINON' },
      { index: 4, text: 'Suite SI', parent_index: 2 },
      { index: 5, text: 'Suite SINON', parent_index: 3 },
    ];
    const { edges } = stepsToGraph(steps);
    const e24 = edges.find((e) => e.source === 'step-2' && e.target === 'step-4');
    const e35 = edges.find((e) => e.source === 'step-3' && e.target === 'step-5');
    expect(e24).toMatchObject({ kind: 'linear' });
    expect(e35).toMatchObject({ kind: 'linear' });
    // Vérifie qu'il n'y a PAS de lien linear 3→4 depuis l'ordre naturel
    // (car step 4 a un parent_index explicite vers 2).
    const wrong34 = edges.find((e) => e.source === 'step-3' && e.target === 'step-4');
    expect(wrong34).toBeUndefined();
  });

  it('propagates branch kind if parent is a condition and child matches true_next/false_next', () => {
    const steps: ScenarioStep[] = [
      {
        index: 1,
        text: 'Decide',
        condition: { type: 'if', expression: 'x', true_next: 2 },
      },
      { index: 2, text: 'A', parent_index: 1 },
    ];
    const { edges } = stepsToGraph(steps);
    // L'edge 1→2 doit être de kind 'true' (label 'SI'), pas linear, car
    // la condition 1 pointe explicitement sur 2 via true_next.
    const e = edges.find((x) => x.source === 'step-1' && x.target === 'step-2');
    expect(e).toMatchObject({ kind: 'true', label: 'SI' });
  });

  it('sorts by index regardless of array order', () => {
    const steps: ScenarioStep[] = [
      { index: 3, text: 'C' },
      { index: 1, text: 'A' },
      { index: 2, text: 'B' },
    ];
    const { edges } = stepsToGraph(steps);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ source: 'step-1', target: 'step-2' });
    expect(edges[1]).toMatchObject({ source: 'step-2', target: 'step-3' });
  });
});
