import { describe, it, expect } from 'vitest';
import { createProjectSchema, updateProjectSchema, PROJECT_TYPES, PROJECT_STATUSES } from './projects';

describe('createProjectSchema', () => {
  it('accepts minimal valid input', () => {
    const r = createProjectSchema.safeParse({
      name: 'Refonte intranet',
      type: 'refonte',
      status: 'chiffrage',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    const r = createProjectSchema.safeParse({ name: '', type: 'dev', status: 'chiffrage' });
    expect(r.success).toBe(false);
  });

  it('rejects name > 255 chars', () => {
    const r = createProjectSchema.safeParse({
      name: 'x'.repeat(256), type: 'dev', status: 'chiffrage',
    });
    expect(r.success).toBe(false);
  });

  it.each(PROJECT_TYPES)('accepts type %s', (t) => {
    expect(createProjectSchema.safeParse({ name: 'P', type: t, status: 'chiffrage' }).success).toBe(true);
  });

  it('rejects unknown type', () => {
    const r = createProjectSchema.safeParse({ name: 'P', type: 'unknown', status: 'chiffrage' });
    expect(r.success).toBe(false);
  });

  it.each(PROJECT_STATUSES)('accepts status %s', (s) => {
    expect(createProjectSchema.safeParse({ name: 'P', type: 'dev', status: s }).success).toBe(true);
  });

  it('rejects target_date before started_at', () => {
    const r = createProjectSchema.safeParse({
      name: 'P', type: 'dev', status: 'chiffrage',
      started_at: '2026-05-01T00:00:00Z',
      target_date: '2026-04-01T00:00:00Z',
    });
    expect(r.success).toBe(false);
  });
});

describe('updateProjectSchema', () => {
  it('allows partial update', () => {
    expect(updateProjectSchema.safeParse({ status: 'recette' }).success).toBe(true);
  });
  it('rejects empty update', () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
  });
});
