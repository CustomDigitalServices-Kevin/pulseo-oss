import { describe, it, expect } from 'vitest';
import { filterVisibleComments } from './visible-comments';

const comments = [
  { id: 'c1', is_internal: false },
  { id: 'c2', is_internal: true },
  { id: 'c3', is_internal: false },
];

describe('filterVisibleComments', () => {
  it('keeps every comment for a staff viewer', () => {
    const out = filterVisibleComments(comments, true);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('strips internal comments for a non-staff viewer', () => {
    const out = filterVisibleComments(comments, false);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(out.every((c) => !c.is_internal)).toBe(true);
  });

  it('returns an empty list when a non-staff viewer only has internal comments', () => {
    const out = filterVisibleComments([{ id: 'x', is_internal: true }], false);
    expect(out).toEqual([]);
  });

  it('handles an empty input list', () => {
    expect(filterVisibleComments([], false)).toEqual([]);
    expect(filterVisibleComments([], true)).toEqual([]);
  });
});
