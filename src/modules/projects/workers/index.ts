/**
 * Worker process pulseo-worker — dédié aux jobs async du module Projets.
 *
 * Comportement :
 *  - Si ENABLE_PROJECTS_MODULE !== 'true' : exit 0 au boot (PM2 respecte
 *    stop_exit_codes: [0] et ne restart pas).
 *  - Sinon : bootstrap graphile-worker et attend les jobs.
 *
 * P1 : aucun handler de job n'est encore enregistré (squelette). Les jobs
 * scan-virus, process-flow, etc. sont ajoutés dans les phases ultérieures.
 */
import { config as loadDotenv } from 'dotenv';
// En prod, .env.production est le fichier déployé. En dev, .env.
// Charge d'abord .env.production si présent (prod), fallback .env (dev).
import { existsSync } from 'fs';
if (existsSync('.env.production')) {
  loadDotenv({ path: '.env.production' });
} else {
  loadDotenv();
}
import { isProjectsEnabled } from '../feature-flag';

async function main() {
  if (!isProjectsEnabled()) {
    console.log('[pulseo-worker] ENABLE_PROJECTS_MODULE is not true — exiting cleanly');
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[pulseo-worker] DATABASE_URL not set');
    process.exit(1);
  }

  const { run } = await import('graphile-worker');
  const { scanVirusHandler } = await import('./scan-virus');
  const { processFlowHandler } = await import('./process-flow');
  const { processMsappHandler } = await import('./process-msapp');
  const { processSolutionHandler } = await import('./process-solution');
  const { processPbixHandler } = await import('./process-pbix');
  const { pingClamd } = await import('../lib/clamav');

  const clamdReachable = await pingClamd();
  if (!clamdReachable) {
    console.warn(
      '[pulseo-worker] clamd unreachable at boot — jobs scan-virus will retry until it comes up',
    );
  } else {
    console.log('[pulseo-worker] clamd ping OK');
  }

  const flowEnabled = process.env.ENABLE_FLOW_PREVIEW === 'true';
  const msappEnabled = process.env.ENABLE_MSAPP_PREVIEW === 'true';
  const solutionEnabled = process.env.ENABLE_SOLUTION_PREVIEW === 'true';
  const pbixEnabled = process.env.ENABLE_PBIX_PREVIEW === 'true';

  const taskList: Record<string, (payload: unknown) => Promise<void>> = {
    'scan-virus': scanVirusHandler,
  };
  if (flowEnabled) taskList['process-flow'] = processFlowHandler;
  if (msappEnabled) taskList['process-msapp'] = processMsappHandler;
  if (solutionEnabled) taskList['process-solution'] = processSolutionHandler;
  if (pbixEnabled) taskList['process-pbix'] = processPbixHandler;

  const runner = await run({
    connectionString: databaseUrl,
    concurrency: 2,
    pollInterval: 1000,
    taskList,
  });

  console.log(
    `[pulseo-worker] started with concurrency=2, tasks=[${Object.keys(taskList).join(', ')}]`,
  );
  await runner.promise;
}

main().catch((err) => {
  console.error('[pulseo-worker] fatal:', err);
  process.exit(1);
});
