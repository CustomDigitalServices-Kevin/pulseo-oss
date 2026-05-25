import { NextRequest, NextResponse } from 'next/server';
import { authLimiter, apiLimiter } from '@/lib/rate-limit';

const protectedPaths = ['/clients', '/admin'];

/**
 * Extract a stable client identifier for rate limiting.
 * Prefers X-Forwarded-For (set by Nginx), falls back to X-Real-IP, then 'unknown'.
 */
function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function rateLimitResponse(resetAt: number, limit: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return new NextResponse(
    JSON.stringify({ error: 'Trop de requetes, veuillez patienter' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
      },
    }
  );
}

/**
 * Build a Content-Security-Policy with a per-request nonce.
 * The nonce is also propagated to Server Components via the
 * `x-nonce` request header so they can attach it to inline scripts.
 *
 * Next.js 16 + Turbopack does NOT currently propagate the x-nonce header
 * to the generated <script> tags for async chunks or to inline hydration
 * scripts. With 'strict-dynamic' this breaks the page entirely (no script
 * can run). Until Next.js/Turbopack support nonce propagation we rely on
 * 'self' (same-origin chunks) + 'unsafe-inline' (React hydration glue).
 * The nonce is still emitted so any code that CAN attach it keeps working;
 * 'unsafe-inline' is ignored by browsers as soon as a nonce is present on
 * the directive, so any future move back to strict-dynamic is a one-line
 * change.
 */
function buildCsp(_nonce: string, isDev: boolean): string {
  // CSP 3 rule: when a nonce source is present, 'unsafe-inline' is IGNORED
  // by browsers. Since Turbopack does not propagate the nonce to generated
  // scripts (neither async chunks nor React hydration inline blobs), we
  // must drop the nonce from script-src entirely so 'unsafe-inline' becomes
  // effective. When upstream fixes nonce propagation, re-add the nonce and
  // remove 'unsafe-inline' in a single commit.
  const scriptSrc = isDev
    ? `'self' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'unsafe-inline'`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Tailwind v4 injects runtime styles; 'unsafe-inline' is required for styles
    // until we migrate to a nonce-based style pipeline.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Rate limiting ─────────────────────────────────────────────────────────
  const ip = getClientIp(request);

  // Strict limit on authentication *initiation* endpoints (5 / 15 min).
  // Intentionally excludes /api/auth/magic-link/verify — that endpoint is
  // hit by the user clicking a real magic link from their inbox; rate-
  // limiting it is user-hostile (one person + a few devices = lockout).
  // Brute-force protection on verification relies on Better Auth's
  // one-time-use tokens with short expiry instead.
  if (
    pathname.startsWith('/api/auth/sign-in') ||
    pathname.startsWith('/api/auth/sign-up') ||
    pathname.startsWith('/api/auth/forget-password') ||
    pathname.startsWith('/api/auth/reset-password')
  ) {
    const result = authLimiter.check(ip);
    if (!result.allowed) return rateLimitResponse(result.resetAt, result.limit);
  }
  // General API limit (100 / min) for non-auth endpoints.
  else if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    const result = apiLimiter.check(ip);
    if (!result.allowed) return rateLimitResponse(result.resetAt, result.limit);
  }

  // Better Auth requires unmodified requests on its own callback URLs,
  // so we short-circuit (rate-limit already applied above) without
  // attaching CSP headers or auth gating for /api/auth/*.
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // ─── CSP nonce ─────────────────────────────────────────────────────────────
  // Generate a cryptographically-random nonce per request and propagate it to
  // Server Components via a request header. The CSP response header pins the
  // same nonce on script-src so inline scripts must match it.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  // ─── Auth gating ───────────────────────────────────────────────────────────
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  // Better Auth sets the session cookie with the "__Secure-" prefix when
  // running over HTTPS (cookie spec for the Secure attribute), and without
  // the prefix in plain HTTP (dev). We must accept both.
  const sessionCookie =
    request.cookies.get('__Secure-better-auth.session_token') ??
    request.cookies.get('better-auth.session_token');
  const hasSession = Boolean(sessionCookie?.value);

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // `/groups/*` and `/me` : sessionwall only. Fine-grained authorisation
  // (canAccessGroup) runs in the layout Server Components because the
  // edge-runtime middleware cannot hit Drizzle/pg. Cookie-only check stays
  // consistent with `protectedPaths` above.
  const isGroupsOrMe = pathname.startsWith('/groups/') || pathname === '/me';
  if (isGroupsOrMe && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged-in user hitting /login goes to a role-agnostic landing. `/clients`
  // always resolves: superadmins see the list of all orgs they belong to,
  // regular members see the single org they have access to.
  // A previous version redirected to `/admin/dashboard` which throws
  // `requireAdmin` for every non-superadmin — the post-login screen then
  // surfaced as "This page couldn't load".
  if (hasSession && pathname === '/login') {
    return NextResponse.redirect(new URL('/clients', request.url));
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);

  // ─── i18n locale cookie (B.1) ──────────────────────────────────────────────
  // Pose un cookie `pulseo_locale` à la première visite depuis l'Accept-Language
  // du browser. Les prochaines requêtes RSC lisent ce cookie via next-intl
  // getRequestConfig. L'utilisateur peut le changer via /me/profile (maj DB +
  // cookie synchronisés). Fallback 'fr' si locale non supportée.
  const existingLocale = request.cookies.get('pulseo_locale')?.value;
  if (!existingLocale) {
    const accept = request.headers.get('accept-language') ?? '';
    const detected = accept.toLowerCase().startsWith('en') ? 'en' : 'fr';
    response.cookies.set('pulseo_locale', detected, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Run on every path except Next.js internals and static assets.
    // Previously /api/auth was also excluded, which made the rate-limit
    // on auth endpoints unreachable (P1-8). We now include it and only
    // short-circuit the CSP/auth-gating inside the handler.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
