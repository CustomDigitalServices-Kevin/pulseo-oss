import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Health check endpoint for monitoring and load balancers.
 *
 * Returns:
 *   200 — service healthy, DB reachable
 *   503 — DB unreachable or other critical failure
 *
 * Body includes uptime, version, environment, db status.
 * No authentication required (designed for external probes).
 *
 * Security: error details from internal services (PG, etc.) are logged
 * server-side but never returned to the client to avoid leaking schema,
 * roles, hostnames or driver internals to an unauthenticated probe.
 */

const startedAt = Date.now();
const VERSION = process.env.npm_package_version ?? '0.1.0';

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
  let healthy = true;

  // Database check
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (error) {
    healthy = false;
    logger.error('Health check: database unreachable', {
      error: error instanceof Error ? error.message : String(error),
    });
    checks.database = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: 'database_unreachable',
    };
  }

  const body = {
    status: healthy ? 'healthy' : 'unhealthy',
    version: VERSION,
    environment: process.env.NODE_ENV ?? 'development',
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
