import { describe, it, expect, beforeEach } from 'vitest';
import { isProjectsEnabled } from './feature-flag';

describe('isProjectsEnabled', () => {
  const original = process.env.ENABLE_PROJECTS_MODULE;
  beforeEach(() => { process.env.ENABLE_PROJECTS_MODULE = original; });

  it('returns true only when env is exactly "true"', () => {
    process.env.ENABLE_PROJECTS_MODULE = 'true';
    expect(isProjectsEnabled()).toBe(true);
  });

  it('returns false for undefined', () => {
    delete process.env.ENABLE_PROJECTS_MODULE;
    expect(isProjectsEnabled()).toBe(false);
  });

  it.each(['', 'false', '1', 'TRUE', 'yes'])('returns false for %s', (v) => {
    process.env.ENABLE_PROJECTS_MODULE = v;
    expect(isProjectsEnabled()).toBe(false);
  });
});
