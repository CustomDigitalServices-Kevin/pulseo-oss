/**
 * Pulseo — Single source of truth for branding and tenant-level configuration.
 *
 * Every user-facing string that depends on the deploying organization (app
 * name, company name, support email, primary domain, etc.) MUST be sourced
 * from this module rather than hardcoded. Anyone forking Pulseo only needs
 * to fill in the `NEXT_PUBLIC_*` and matching server-side env vars described
 * in `.env.example` to fully rebrand the portal.
 *
 * Variables prefixed `NEXT_PUBLIC_` are inlined at build time and are safe
 * to import from client components. Non-prefixed variables are server-only
 * and must never be imported from a `'use client'` boundary.
 */

export interface AppConfig {
  /** Public application name. Displayed in browser tab, emails, OG tags. */
  name: string;
  /** Short tagline. Surfaced on the home page, OG description and emails. */
  tagline: string;
  /** Legal company / organization owning the deployment. Shown in footers. */
  companyName: string;
  /** Short company name used inline ("by {companyShort}"). */
  companyShort: string;
  /** Public marketing description of what the company does. */
  companyDescription: string;
  /** Customer-facing contact email (sales / support funnel). */
  contactEmail: string;
  /** GDPR / privacy officer email (DPO). */
  dpoEmail: string;
  /** Canonical URL of the production deployment (no trailing slash). */
  appUrl: string;
  /** Hex color used for primary CTAs and brand accents. */
  primaryColor: string;
  /** Hex color used for secondary accents (gradients, dark variant). */
  secondaryColor: string;
  /** ISO 3166-1 alpha-2 country of the company (used in legal pages). */
  companyCountry: string;
  /** Public business identifier shown on legal pages (SIREN / EIN / etc.). */
  companyRegistration: string;
}

function readPublic(key: string, fallback: string): string {
  // Next.js inlines NEXT_PUBLIC_* at build time. In the absence of a value
  // we fall back to the documented default so the app stays renderable on
  // a fresh clone before .env has been populated.
  const value = process.env[`NEXT_PUBLIC_${key}`];
  return value && value.trim().length > 0 ? value : fallback;
}

export const appConfig: AppConfig = {
  name: readPublic('APP_NAME', 'Pulseo'),
  tagline: readPublic('APP_TAGLINE', 'Your client portal, simplified.'),
  companyName: readPublic('COMPANY_NAME', 'Your Company'),
  companyShort: readPublic('COMPANY_SHORT', 'Your Co.'),
  companyDescription: readPublic(
    'COMPANY_DESCRIPTION',
    'Client portal for tickets, contracts, documents and dashboards.'
  ),
  contactEmail: readPublic('CONTACT_EMAIL', 'contact@example.com'),
  dpoEmail: readPublic('DPO_EMAIL', 'privacy@example.com'),
  appUrl: readPublic('APP_URL', 'http://localhost:3000'),
  primaryColor: readPublic('PRIMARY_COLOR', '#2563EB'),
  secondaryColor: readPublic('SECONDARY_COLOR', '#1E40AF'),
  companyCountry: readPublic('COMPANY_COUNTRY', 'FR'),
  companyRegistration: readPublic('COMPANY_REGISTRATION', '000000000'),
};

/**
 * Server-side resolver for the canonical app URL. Prefers an explicit
 * `BETTER_AUTH_URL` (matches Better Auth's own resolution) then falls back
 * to the public app URL. Use this in email templates / server actions
 * that need an absolute URL.
 */
export function getServerAppUrl(): string {
  return process.env.BETTER_AUTH_URL || appConfig.appUrl;
}

/**
 * Friendly footer line for outgoing emails: "Pulseo by Your Company".
 */
export function getEmailFooterBrand(): string {
  return `${appConfig.name} by ${appConfig.companyName}`;
}
