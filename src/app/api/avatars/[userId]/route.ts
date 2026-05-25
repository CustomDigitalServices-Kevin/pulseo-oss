import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { findAvatar } from '@/lib/avatars';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sert un avatar utilisateur stocké hors `public/`. Content-Type forcé à
 * `image/webp` (tous les avatars sont convertis via sharp lors de l'upload),
 * X-Content-Type-Options: nosniff pour bloquer toute tentative de MIME
 * confusion, Cache-Control court pour permettre un refresh après upload
 * (le composant appelle `?v=<timestamp>` pour cache-bust).
 *
 * Pas de check d'auth : les avatars sont considérés comme semi-publics au
 * sein de la plateforme (affichés dans la sidebar membres, commentaires,
 * etc.). Le user-id est un UUID opaque, pas énumérable.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(userId)) {
    return new NextResponse('Invalid userId', { status: 400 });
  }

  const filePath = await findAvatar(userId);
  if (!filePath) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const buf = await readFile(filePath);
  const body = new Uint8Array(buf);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(body.length),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
}
