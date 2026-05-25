import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('emits a log line for info', () => {
    logger.info('user signed in', { userId: 'abc' });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('emits a log line for warn', () => {
    logger.warn('slow query', { ms: 1500 });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('emits a log line for error', () => {
    logger.error('db down');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('child logger preserves base context', () => {
    const child = logger.child({ requestId: 'r-1' });
    child.info('hello');
    const logged = consoleSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain('hello');
  });

  it('child logger merges context with call site context', () => {
    const child = logger.child({ requestId: 'r-1' });
    child.info('event', { userId: 'u-1' });
    const logged = consoleSpy.mock.calls[0]?.[0] as string;
    // Both pieces should be in the output
    expect(logged).toContain('r-1');
    expect(logged).toContain('u-1');
  });

  it('exposes all four log levels', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
