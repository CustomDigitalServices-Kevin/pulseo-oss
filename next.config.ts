import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["better-auth", "isomorphic-dompurify", "jsdom"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  typescript: {
    tsconfigPath: "./tsconfig.json",
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "geolocation=(), microphone=(), camera=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        // Content-Security-Policy is emitted per-request by `src/proxy.ts`
        // with a fresh nonce + frame-ancestors 'none'. Keeping it here would
        // override the proxy header. `X-XSS-Protection` is intentionally
        // omitted: deprecated by OWASP/MDN, removed from Chrome since 2021.
      ],
    },
  ],
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
};

export default withNextIntl(nextConfig);
