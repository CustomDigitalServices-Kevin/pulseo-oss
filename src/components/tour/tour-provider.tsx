'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { driver, type Driver, type DriveStep } from 'driver.js';
import { markTourCompleted } from '@/actions/tour';

interface TourProviderProps {
  /**
   * Auto-déclencher au mount (première visite). Le layout RSC évalue
   * `users.tour_completed_at IS NULL` et passe `true` si pas encore vu.
   */
  autoStart: boolean;
  /**
   * Slug de l'org à utiliser pour le deep-link "Nouveau ticket" si l'user
   * lance le tour depuis une page non org-scoped (ex: `/admin/*`). On préfère
   * l'org dérivée du pathname courant — ce fallback ne sert qu'au cas où.
   */
  fallbackOrgSlug: string | null;
}

/**
 * TourProvider monté dans `(portal)/layout.tsx`. Le composant ne rend rien :
 * il instancie driver.js dans un useEffect (jamais en SSR), écoute l'événement
 * `pulseo:tour-restart` dispatché par le bouton Aide, et persiste l'achèvement
 * du premier tour via Server Action.
 *
 * Décisions :
 * - Import statique de `driver.js` : 'use client' garantit pas d'évaluation SSR.
 * - CSS de driver.js importé une seule fois dans `src/app/globals.css`,
 *   complété par un override dark Pulseo dans le même fichier.
 * - Navigation auto entre steps : les steps 2/3 ont un `onNextClick` qui
 *   `router.push` puis `driver.moveNext()` après stabilisation hydratation.
 *   Pattern recommandé driver.js : définir onNextClick désactive le moveNext
 *   par défaut, donc on appelle moveNext() manuellement après navigation.
 *   Source : https://github.com/kamranahmedse/driver.js/blob/master/src/driver.ts
 * - `hasAutoStartedRef` empêche le re-trigger autoStart quand l'user navigue
 *   manuellement (clic sur lien sidebar) entre le mount et la fin du tour.
 * - ARIA patches via onPopoverRender (cf issue #434).
 *
 * Refs :
 *   https://driverjs.com/docs/configuration
 *   https://github.com/kamranahmedse/driver.js/issues/434
 */
export function TourProvider({ autoStart, fallbackOrgSlug }: TourProviderProps) {
  const t = useTranslations('tour');
  const router = useRouter();
  const pathname = usePathname();
  const driverRef = useRef<Driver | null>(null);
  const restartCountRef = useRef(0);
  const hasAutoStartedRef = useRef(false);

  // Dérive l'org slug du pathname courant : `/clients/[slug]/...` ou
  // `/admin/clients/[slug]/...`. Fallback sur la prop si on est en dehors
  // d'un contexte org (ex: `/me`, `/admin/dashboard`).
  const currentOrgSlug = (() => {
    const m = pathname.match(/^\/(?:admin\/)?clients\/([^/]+)/);
    return m?.[1] ?? fallbackOrgSlug;
  })();

  const buildSteps = useCallback(
    (orgSlug: string | null): DriveStep[] => {
      // navigateAndAdvance : `router.push` + attente que l'élément cible du step
      // suivant soit présent dans le DOM (max 2s) avant `moveNext`.
      const navigateAndAdvance = async (
        href: string,
        nextSelector: string,
        d: Driver,
      ) => {
        router.push(href);
        // Poll DOM jusqu'à ce que le selector soit là (Next.js App Router peut
        // mettre 200-1000ms à hydrater la nouvelle route en dev).
        const start = Date.now();
        while (Date.now() - start < 2000) {
          if (document.querySelector(nextSelector)) break;
          await new Promise((r) => setTimeout(r, 80));
        }
        d.moveNext();
      };

      return [
        {
          popover: {
            title: t('step1Title'),
            description: t('step1Body'),
          },
        },
        {
          element: '[data-tour-id="sidebar-tickets"]',
          popover: {
            title: t('step2Title'),
            description: t('step2Body'),
            side: 'right',
            align: 'start',
            onNextClick: (_el, _step, { driver: d }) => {
              if (orgSlug) {
                void navigateAndAdvance(
                  `/clients/${orgSlug}/tickets`,
                  '[data-tour-id="new-ticket-cta"]',
                  d,
                );
              } else {
                d.moveNext();
              }
            },
          },
        },
        {
          element: '[data-tour-id="new-ticket-cta"]',
          popover: {
            title: t('step3Title'),
            description: t('step3Body'),
            side: 'bottom',
            align: 'end',
            onNextClick: (_el, _step, { driver: d }) => {
              if (orgSlug) {
                void navigateAndAdvance(
                  `/clients/${orgSlug}/tickets/new`,
                  '[data-tour-id="ticket-title"]',
                  d,
                );
              } else {
                d.moveNext();
              }
            },
          },
        },
        {
          element: '[data-tour-id="ticket-title"]',
          popover: {
            title: t('step4Title'),
            description: t('step4Body'),
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour-id="ticket-description"]',
          popover: {
            title: t('step5Title'),
            description: t('step5Body'),
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour-id="ticket-priority"]',
          popover: {
            title: t('step6Title'),
            description: t('step6Body'),
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour-id="ticket-submit"]',
          popover: {
            title: t('step7Title'),
            description: t('step7Body'),
            side: 'top',
            align: 'end',
          },
        },
        {
          element: '[data-tour-id="user-menu"]',
          popover: {
            title: t('step8Title'),
            description: t('step8Body'),
            side: 'bottom',
            align: 'end',
          },
        },
      ];
    },
    [router, t],
  );

  const startTour = useCallback(() => {
    try {
      driverRef.current?.destroy();

      const instance = driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: true,
        overlayOpacity: 0.65,
        stagePadding: 6,
        stageRadius: 10,
        popoverClass: 'pulseo-tour',
        nextBtnText: t('next'),
        prevBtnText: t('prev'),
        doneBtnText: t('done'),
        progressText: t('progressText', { current: '{{current}}', total: '{{total}}' }),
        steps: buildSteps(currentOrgSlug),
        onPopoverRender: (popover) => {
          if (popover.wrapper) {
            popover.wrapper.setAttribute('aria-label', t('a11yPopoverLabel'));
            popover.wrapper.setAttribute('role', 'dialog');
            popover.wrapper.setAttribute('aria-modal', 'false');
          }
        },
        onDestroyed: () => {
          if (restartCountRef.current === 0) {
            void markTourCompleted().then((r) => {
              if (!r.success) {
                console.warn('[tour] markTourCompleted failed:', r.error);
              }
            });
          }
          restartCountRef.current += 1;
        },
      });

      driverRef.current = instance;
      instance.drive();
    } catch (err) {
      console.error('[tour] failed to start:', err);
    }
  }, [buildSteps, currentOrgSlug, t]);

  // Auto-start sur première visite. `hasAutoStartedRef` empêche tout
  // re-trigger lors de navigations manuelles (clics sidebar) entre le mount
  // et la fin du tour. Une fois marqué true, ne se réarme qu'au démontage
  // complet du provider (déconnexion / remount full reload).
  useEffect(() => {
    if (!autoStart) return;
    if (hasAutoStartedRef.current) return;
    if (!pathname.startsWith('/clients/')) return;

    hasAutoStartedRef.current = true;
    const timer = setTimeout(() => {
      startTour();
    }, 500);
    return () => clearTimeout(timer);
  }, [autoStart, pathname, startTour]);

  // Bouton Aide : déplacement sur la liste tickets de l'org courante puis lance
  // le tour. Pas de garde re-entrée : le user peut relancer à volonté.
  useEffect(() => {
    const handler = () => {
      if (currentOrgSlug && !pathname.includes('/tickets')) {
        router.push(`/clients/${currentOrgSlug}/tickets`);
        setTimeout(() => startTour(), 700);
        return;
      }
      startTour();
    };
    window.addEventListener('pulseo:tour-restart', handler);
    return () => window.removeEventListener('pulseo:tour-restart', handler);
  }, [currentOrgSlug, pathname, router, startTour]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  return null;
}
