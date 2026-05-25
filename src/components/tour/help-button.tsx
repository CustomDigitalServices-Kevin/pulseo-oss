'use client';

import { useTranslations } from 'next-intl';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Bouton "Aide" persistent dans le header. Relance le tour onboarding via
 * un événement window custom écouté par TourProvider. Aucune mise à jour DB :
 * le tour reste marqué `tour_completed_at != NULL` après skip ou done initial,
 * mais l'user peut le rejouer à volonté.
 */
export function HelpButton() {
  const t = useTranslations('tour');

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('pulseo:tour-restart'));
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={t('helpButtonAria')}
      title={t('helpButtonAria')}
      className="text-foreground-muted hover:text-foreground"
    >
      <HelpCircle className="w-5 h-5" />
    </Button>
  );
}
