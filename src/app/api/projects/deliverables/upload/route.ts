export { handleDeliverableUpload as POST } from '@/modules/projects/api/deliverables';

// Streaming route — pas de body parser, pas de cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
