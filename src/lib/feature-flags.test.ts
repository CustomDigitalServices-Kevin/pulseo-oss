import { describe, it, expect, afterEach } from 'vitest';
import { isActivityLoggingEnabled } from './feature-flags';

describe('feature flags', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('disables activity logging by default', () => {
    delete process.env.ENABLE_ACTIVITY_LOGGING;
    expect(isActivityLoggingEnabled()).toBe(false);
  });

  it('enables activity logging when env=true', () => {
    process.env.ENABLE_ACTIVITY_LOGGING = 'true';
    expect(isActivityLoggingEnabled()).toBe(true);
  });
});
