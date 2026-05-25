/**
 * Duration formatting helpers — shared across dashboards.
 *
 * Kept intentionally tiny: no third-party dep, no locale switching. Used by
 * the admin global dashboard (E3), the group dashboard (E4), and — later —
 * the org dashboard (E5). Centralising this avoids drift when the threshold
 * or label shape is tweaked.
 */

/**
 * Threshold (in hours) at which the formatter switches from "Xh" to "Xj".
 * 72 hours = 3 days; past this, hour-precision is noise.
 *
 * Exported so tests can assert the boundary without hard-coding the literal.
 */
export const HOURS_TO_DAYS_THRESHOLD = 72;

/**
 * Format a median response time (in minutes) for KPI / alert display.
 *
 * - `null` / `undefined` → `"—"` (em-dash — no data available).
 * - Rounded hours `< 72` → `"Xh"`.
 * - Rounded hours `>= 72` → `"Xj"` (days rounded).
 *
 * **Boundary semantics:** the threshold check runs on the *rounded* hour
 * count to avoid a display glitch where e.g. `71.6h` rounds to `72h` and
 * visually contradicts the "3j" intent of the threshold. Callers expecting
 * strict hour display below 72 exact hours should not use this helper.
 */
export function formatMedianMinutes(
  minutes: number | null | undefined,
): string {
  if (minutes == null) return '—';
  const hours = minutes / 60;
  const h = Math.round(hours);
  if (h < HOURS_TO_DAYS_THRESHOLD) return `${h}h`;
  return `${Math.round(hours / 24)}j`;
}
