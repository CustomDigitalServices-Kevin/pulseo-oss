/**
 * Server-side visibility filter for ticket comments.
 *
 * Internal comments (`is_internal = true`) are staff-only: they must be
 * stripped BEFORE the data reaches any client component. Staff means an
 * effective role of gestionnaire or above on the org (superadmins resolve
 * to 'admin' via getMemberRole, so they are covered).
 */
export function filterVisibleComments<T extends { is_internal: boolean }>(
  comments: T[],
  viewerIsStaff: boolean,
): T[] {
  if (viewerIsStaff) return comments;
  return comments.filter((c) => !c.is_internal);
}
