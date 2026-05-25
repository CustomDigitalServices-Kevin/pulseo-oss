import { describe, it, expect } from 'vitest';
import {
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  AXIS_TICK,
  GRID_STROKE,
  OKLCH_SUCCESS,
  OKLCH_DANGER,
  OKLCH_WARNING,
  OKLCH_INFO,
  ORG_COLOR_CYCLE,
  orgColor,
} from './tokens';

describe('chart tokens', () => {
  it('TOOLTIP_STYLE is a non-empty CSSProperties object', () => {
    expect(TOOLTIP_STYLE.background).toMatch(/^oklch/);
    expect(TOOLTIP_STYLE.color).toMatch(/^oklch/);
    expect(TOOLTIP_STYLE.borderRadius).toBeDefined();
  });

  it('TOOLTIP_LABEL_STYLE carries a color and fontSize', () => {
    expect(TOOLTIP_LABEL_STYLE.color).toMatch(/^oklch/);
    expect(TOOLTIP_LABEL_STYLE.fontSize).toBe(11);
  });

  it('AXIS_TICK has a fill and fontSize', () => {
    expect(AXIS_TICK.fill).toMatch(/^oklch/);
    expect(AXIS_TICK.fontSize).toBe(11);
  });

  it('GRID_STROKE is an oklch string', () => {
    expect(GRID_STROKE).toMatch(/^oklch/);
  });

  it('exposes semantic oklch palette constants', () => {
    for (const c of [OKLCH_SUCCESS, OKLCH_DANGER, OKLCH_WARNING, OKLCH_INFO]) {
      expect(c).toMatch(/^oklch\(/);
    }
  });

  it('ORG_COLOR_CYCLE exposes 10 distinct oklch colours', () => {
    expect(ORG_COLOR_CYCLE.length).toBe(10);
    for (const c of ORG_COLOR_CYCLE) {
      expect(c).toMatch(/^oklch\(/);
    }
    // No duplicates — rotation would otherwise collide within the cycle.
    expect(new Set(ORG_COLOR_CYCLE).size).toBe(ORG_COLOR_CYCLE.length);
  });

  it('orgColor returns the expected entry at indices 0 and 3', () => {
    expect(orgColor(0)).toBe(ORG_COLOR_CYCLE[0]);
    expect(orgColor(3)).toBe(ORG_COLOR_CYCLE[3]);
  });

  it('orgColor wraps around the cycle for out-of-range indices', () => {
    const len = ORG_COLOR_CYCLE.length;
    expect(orgColor(len)).toBe(ORG_COLOR_CYCLE[0]);
    expect(orgColor(len + 1)).toBe(ORG_COLOR_CYCLE[1]);
    expect(orgColor(len * 3 + 2)).toBe(ORG_COLOR_CYCLE[2]);
  });

  it('orgColor handles negative indices defensively', () => {
    expect(orgColor(-1)).toBe(ORG_COLOR_CYCLE[ORG_COLOR_CYCLE.length - 1]);
  });
});
