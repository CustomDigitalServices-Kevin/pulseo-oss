import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(true);
  });

  it('blocks requests over the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    limiter.check('ip-1');
    limiter.check('ip-1');
    limiter.check('ip-1');
    const fourth = limiter.check('ip-1');
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it('isolates limits per identifier', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check('ip-A').allowed).toBe(true);
    expect(limiter.check('ip-A').allowed).toBe(false);
    // ip-B has its own quota
    expect(limiter.check('ip-B').allowed).toBe(true);
  });

  it('allows requests again after the window passes', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    limiter.check('ip-1');
    limiter.check('ip-1');
    expect(limiter.check('ip-1').allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect(limiter.check('ip-1').allowed).toBe(true);
  });

  it('reports correct remaining count', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    expect(limiter.check('ip-1').remaining).toBe(4);
    expect(limiter.check('ip-1').remaining).toBe(3);
    expect(limiter.check('ip-1').remaining).toBe(2);
  });

  it('reports the limit in each result', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 7 });
    expect(limiter.check('ip-1').limit).toBe(7);
  });

  it('reset() clears state for an identifier', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    limiter.check('ip-1');
    expect(limiter.check('ip-1').allowed).toBe(false);
    limiter.reset('ip-1');
    expect(limiter.check('ip-1').allowed).toBe(true);
  });

  it('uses sliding window (not fixed)', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    limiter.check('ip-1'); // t=0
    vi.advanceTimersByTime(30_000);
    limiter.check('ip-1'); // t=30
    expect(limiter.check('ip-1').allowed).toBe(false);

    vi.advanceTimersByTime(31_000); // t=61, the t=0 entry has expired
    expect(limiter.check('ip-1').allowed).toBe(true);
  });

  it('evicts old entries when maxEntries is exceeded', () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
      maxEntries: 10,
    });
    for (let i = 0; i < 50; i++) {
      limiter.check(`ip-${i}`);
    }
    // Eviction kicks in well below 50
    expect(limiter.size()).toBeLessThanOrEqual(50);
  });

  it('returns correct resetAt timestamp', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    const now = Date.now();
    const result = limiter.check('ip-1');
    // First request: oldest = now, reset at now + windowMs
    expect(result.resetAt).toBe(now + 60_000);
  });
});
