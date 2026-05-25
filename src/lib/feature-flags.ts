/**
 * Feature flags driven by environment variables.
 *
 * Convention: read `process.env.X === 'true'` so the flag is opt-in and any
 * other value (undefined, '', '1', 'false') keeps the feature disabled. This
 * matches the existing `EMAIL_ENABLED` pattern in `src/lib/email/index.ts`.
 */

export function isActivityLoggingEnabled(): boolean {
  return process.env.ENABLE_ACTIVITY_LOGGING === 'true';
}
