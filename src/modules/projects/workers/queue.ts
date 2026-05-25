/**
 * Helper d'ajout de jobs graphile-worker côté API/actions.
 *
 * graphile-worker expose `quickAddJob` pour enqueuer sans avoir à maintenir
 * un runner ouvert. Utilisé depuis les flows upload (documents, deliverables)
 * pour demander un scan virus à la fin de l'INSERT DB.
 *
 * Sépare le code d'enqueue du runner (workers/index.ts) pour éviter de
 * charger graphile-worker runtime dans les Server Actions — uniquement
 * l'entrée quickAddJob (lightweight).
 */
export async function addJobToQueue(
  taskName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  // Import dynamique : graphile-worker n'est chargé que si quickAddJob est
  // appelé. Les Server Actions qui n'enqueuent pas n'alourdissent pas le
  // bundle (tree-shaking server-side).
  const { quickAddJob } = await import('graphile-worker');

  await quickAddJob(
    { connectionString: databaseUrl },
    taskName,
    payload,
  );
}
