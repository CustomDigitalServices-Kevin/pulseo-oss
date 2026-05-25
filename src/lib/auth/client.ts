import { createAuthClient } from 'better-auth/react';
import { organizationClient, magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [
    organizationClient(),
    magicLinkClient(),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient;
