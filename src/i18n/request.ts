import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/validations/profile';

/**
 * Resolver next-intl cookie-only (sans segment URL `[locale]`). Les URLs
 * existantes (`/clients/[slug]/...`) restent inchangées. La locale est lue
 * côté RSC via `cookies()`.
 *
 * Le cookie `pulseo_locale` est posé par le middleware proxy.ts à la première
 * visite (depuis Accept-Language). L'utilisateur peut ensuite le changer
 * via /me/profile (action updateLocale met à jour DB + cookie).
 *
 * Référence : https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get('pulseo_locale')?.value;
  const locale: SupportedLocale =
    raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw)
      ? (raw as SupportedLocale)
      : 'fr';

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    // En dev : throw explicite si clé manquante pour forcer la rigueur côté
    // dev. En prod : warn + retourne la clé brute (comportement next-intl
    // par défaut) pour éviter une page blanche sur un oubli ponctuel.
    onError:
      process.env.NODE_ENV === 'development'
        ? (error) => {
            throw error;
          }
        : undefined,
  };
});
