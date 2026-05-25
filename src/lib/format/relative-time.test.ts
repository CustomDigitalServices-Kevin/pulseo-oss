import { describe, it, expect } from 'vitest';
import { formatRelativeFr } from './relative-time';

const RSQUO = '\u2019';

describe('formatRelativeFr', () => {
  it('returns the instant string for < 45s', () => {
    const d = new Date(Date.now() - 10_000);
    expect(formatRelativeFr(d)).toBe(`à l${RSQUO}instant`);
  });

  it('returns minutes between 45s and 1h', () => {
    const d = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeFr(d)).toBe('il y a 5 min');
  });

  it('returns hours between 1h and 24h', () => {
    const d = new Date(Date.now() - 3 * 3_600_000);
    expect(formatRelativeFr(d)).toBe('il y a 3 h');
  });

  it('returns days between 1d and 30d', () => {
    const d = new Date(Date.now() - 3 * 86_400_000);
    expect(formatRelativeFr(d)).toBe('il y a 3 j');
  });

  it('returns short date past 30 days', () => {
    const d = new Date(Date.now() - 60 * 86_400_000);
    const out = formatRelativeFr(d);
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('treats future dates as the instant string', () => {
    const d = new Date(Date.now() + 5_000);
    expect(formatRelativeFr(d)).toBe(`à l${RSQUO}instant`);
  });

  it('accepts string and number inputs', () => {
    const d = new Date(Date.now() - 2 * 60_000);
    expect(formatRelativeFr(d.toISOString())).toBe('il y a 2 min');
    expect(formatRelativeFr(d.getTime())).toBe('il y a 2 min');
  });
});
