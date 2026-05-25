import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { organization, magicLink } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db, schema } from '../db';
import { sendMagicLinkEmail } from '../email';
import { logActivityEvent } from '../activity/log-event';

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET environment variable is required');
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  basePath: '/api/auth',
  appName: 'Pulseo',
  trustedOrigins: [process.env.BETTER_AUTH_URL || 'http://localhost:3000'],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  // Top-level `hooks.after` fires for every Better Auth endpoint. We only log
  // when the endpoint is a successful sign-in, detected via `ctx.path` + the
  // presence of `ctx.context.newSession` (set by `setSessionCookie` after a
  // successful password or magic-link login). Note: magic-link sign-in
  // resolves at `/magic-link/verify`, not `/sign-in/magic-link` (that path
  // only *sends* the email and does not create a session).
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const newSession = ctx.context?.newSession;
      if (!newSession) return;
      if (ctx.path === '/sign-in/email' || ctx.path === '/magic-link/verify') {
        logActivityEvent({
          userId: newSession.user.id,
          eventType: 'login',
        });
      }
    }),
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: false,
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url, 'Pulseo');
      },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
