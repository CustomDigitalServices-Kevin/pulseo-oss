import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isProjectsEnabled } from "./feature-flag";

describe("isProjectsEnabled", () => {
  const original = process.env.ENABLE_PROJECTS_MODULE;
  beforeEach(() => {
    process.env.ENABLE_PROJECTS_MODULE = original;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true only when env is exactly "true"', () => {
    process.env.ENABLE_PROJECTS_MODULE = "true";
    expect(isProjectsEnabled()).toBe(true);
  });

  // The strict opt-in contract only holds in production: outside production
  // the dev fallback (`NODE_ENV !== 'production'` → true) short-circuits it,
  // so these cases must pin NODE_ENV to 'production' to test the guard.
  it("returns false in production for undefined", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ENABLE_PROJECTS_MODULE;
    expect(isProjectsEnabled()).toBe(false);
  });

  it.each(["", "false", "1", "TRUE", "yes"])(
    "returns false in production for %s",
    (v) => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.ENABLE_PROJECTS_MODULE = v;
      expect(isProjectsEnabled()).toBe(false);
    },
  );

  it("returns true outside production even without the flag (dev fallback)", () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.ENABLE_PROJECTS_MODULE;
    expect(isProjectsEnabled()).toBe(true);
  });
});
