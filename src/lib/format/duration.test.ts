import { describe, it, expect } from 'vitest';
import { formatMedianMinutes, HOURS_TO_DAYS_THRESHOLD } from './duration';

describe('formatMedianMinutes', () => {
  it('renders em-dash for null', () => {
    expect(formatMedianMinutes(null)).toBe('—');
  });

  it('renders em-dash for undefined', () => {
    expect(formatMedianMinutes(undefined)).toBe('—');
  });

  it('renders 60 minutes as "1h"', () => {
    expect(formatMedianMinutes(60)).toBe('1h');
  });

  it('rounds sub-hour values to the nearest hour (30min → 1h, bankers rounding rounds 0.5 up)', () => {
    // 30 min = 0.5h. Math.round(0.5) === 1 (IEEE half-away-from-zero).
    expect(formatMedianMinutes(30)).toBe('1h');
    // 20 min = 0.333h → rounds to 0 → "0h"
    expect(formatMedianMinutes(20)).toBe('0h');
  });

  it('renders values just under the threshold as hours', () => {
    // 71h exactly → "71h"
    expect(formatMedianMinutes(71 * 60)).toBe('71h');
    // 71.4h → rounds to 71 → "71h"
    expect(formatMedianMinutes(71.4 * 60)).toBe('71h');
  });

  it('boundary: 71.5h rounds to 72 → days branch → "3j"', () => {
    // Regression guard — was the E4 rounding bug that produced "72h".
    expect(formatMedianMinutes(71.5 * 60)).toBe('3j');
  });

  it('72h exact → days branch → "3j"', () => {
    expect(formatMedianMinutes(HOURS_TO_DAYS_THRESHOLD * 60)).toBe('3j');
  });

  it('10 days exact → "10j"', () => {
    expect(formatMedianMinutes(60 * 24 * 10)).toBe('10j');
  });

  it('rounds day counts (10.6 days → 11j)', () => {
    // 10.6 days = 254.4 hours (well above threshold) → Math.round(10.6) = 11
    expect(formatMedianMinutes(60 * 24 * 10.6)).toBe('11j');
  });

  it('HOURS_TO_DAYS_THRESHOLD is 72 (sanity pin)', () => {
    // If the threshold is ever tuned, this assertion fails and forces an
    // explicit review of downstream snapshots / screenshots.
    expect(HOURS_TO_DAYS_THRESHOLD).toBe(72);
  });
});
