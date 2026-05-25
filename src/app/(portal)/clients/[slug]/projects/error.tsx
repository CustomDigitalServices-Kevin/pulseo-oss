'use client';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export default function ProjectsError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('projects.errorBoundary');
  useEffect(() => {
    logger.error('[projects/route] error boundary', { err: error.message, stack: error.stack });
  }, [error]);
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6">
      <h2 className="text-lg font-semibold text-destructive">{t('title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('body')}
      </p>
      <Button onClick={reset} variant="outline" className="mt-4">{t('retry')}</Button>
    </div>
  );
}
