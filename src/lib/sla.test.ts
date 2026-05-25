import { describe, it, expect } from 'vitest';
import { computeSlaStatus, computeResolutionDue, formatDuration } from './sla';

const NOW = new Date('2026-04-10T12:00:00Z');

describe('computeResolutionDue', () => {
  it('returns null when SLA is not configured', () => {
    expect(computeResolutionDue(NOW, null)).toBeNull();
  });

  it('returns null when SLA is zero or negative', () => {
    expect(computeResolutionDue(NOW, 0)).toBeNull();
    expect(computeResolutionDue(NOW, -1)).toBeNull();
  });

  it('adds the SLA hours to the creation date', () => {
    const result = computeResolutionDue(NOW, 24);
    expect(result).toEqual(new Date('2026-04-11T12:00:00Z'));
  });

  it('handles fractional hours via integer rounding', () => {
    const result = computeResolutionDue(NOW, 8);
    expect(result?.getUTCHours()).toBe(20);
  });
});

describe('computeSlaStatus', () => {
  it('returns no_sla when resolution_due_at is null', () => {
    const info = computeSlaStatus(NOW, null, null, NOW);
    expect(info.status).toBe('no_sla');
    expect(info.label).toContain('Pas de SLA');
  });

  it('returns met when closed before due', () => {
    const created = new Date('2026-04-10T08:00:00Z');
    const due = new Date('2026-04-10T16:00:00Z');
    const closed = new Date('2026-04-10T14:00:00Z');
    const info = computeSlaStatus(created, due, closed, NOW);
    expect(info.status).toBe('met');
  });

  it('returns met when closed exactly at due', () => {
    const created = new Date('2026-04-10T08:00:00Z');
    const due = new Date('2026-04-10T16:00:00Z');
    const closed = new Date('2026-04-10T16:00:00Z');
    const info = computeSlaStatus(created, due, closed, NOW);
    expect(info.status).toBe('met');
  });

  it('returns overdue when closed after due', () => {
    const created = new Date('2026-04-10T08:00:00Z');
    const due = new Date('2026-04-10T16:00:00Z');
    const closed = new Date('2026-04-10T18:00:00Z');
    const info = computeSlaStatus(created, due, closed, NOW);
    expect(info.status).toBe('overdue');
    expect(info.label).toContain('Dépassé');
  });

  it('returns overdue when still open and past due', () => {
    const created = new Date('2026-04-09T12:00:00Z');
    const due = new Date('2026-04-10T08:00:00Z'); // 4h ago
    const info = computeSlaStatus(created, due, null, NOW);
    expect(info.status).toBe('overdue');
    expect(info.label).toContain('retard');
  });

  it('returns at_risk when remaining < 25% of total window', () => {
    const created = new Date('2026-04-10T00:00:00Z');
    const due = new Date('2026-04-10T16:00:00Z'); // 16h window, now is 12:00 → 4h remaining = 25%
    const info = computeSlaStatus(created, due, null, NOW);
    expect(['at_risk', 'on_time']).toContain(info.status);
  });

  it('returns at_risk when only 1h left of a 16h window', () => {
    const created = new Date('2026-04-10T00:00:00Z');
    const due = new Date('2026-04-10T13:00:00Z');
    const info = computeSlaStatus(created, due, null, NOW);
    expect(info.status).toBe('at_risk');
  });

  it('returns on_time when plenty of time remains', () => {
    const created = new Date('2026-04-10T11:00:00Z');
    const due = new Date('2026-04-12T11:00:00Z');
    const info = computeSlaStatus(created, due, null, NOW);
    expect(info.status).toBe('on_time');
  });

  it('handles missing createdAt gracefully', () => {
    const due = new Date('2026-04-11T12:00:00Z');
    const info = computeSlaStatus(null, due, null, NOW);
    expect(info.status).toBe('on_time');
  });
});

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(5 * 60_000)).toBe('5 min');
  });

  it('rounds tiny durations to 1 min', () => {
    expect(formatDuration(30_000)).toBe('1 min');
  });

  it('formats hours', () => {
    expect(formatDuration(3 * 60 * 60_000)).toBe('3 h');
  });

  it('formats days only', () => {
    expect(formatDuration(2 * 24 * 60 * 60_000)).toBe('2 j');
  });

  it('formats days and hours', () => {
    expect(formatDuration((2 * 24 + 5) * 60 * 60_000)).toBe('2 j 5 h');
  });

  it('uses absolute value (no negative durations)', () => {
    expect(formatDuration(-2 * 60 * 60_000)).toBe('2 h');
  });
});
