import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Debug endpoint (B.3+) : permet de vérifier depuis le browser si le cookie
 * pulseo_locale est bien propagé côté serveur et si next-intl getLocale()
 * retourne la valeur attendue. Non-auth, sans info sensible.
 *
 * Disabled in production to avoid exposing internal cookie state to anyone
 * who can reach the public origin.
 *
 * Usage : curl -b "pulseo_locale=en" http://localhost:3000/api/debug/locale
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  const store = await cookies();
  const raw = store.get('pulseo_locale')?.value ?? null;
  const resolved = await getLocale();
  return NextResponse.json({
    cookieValue: raw,
    resolvedLocale: resolved,
    note: 'Si cookieValue != resolvedLocale, probleme de lecture cote serveur.',
  });
}
