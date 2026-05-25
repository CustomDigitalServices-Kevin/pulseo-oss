'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QuotaGaugeProps {
  consumed: number;
  quota: number;
}

export function QuotaGauge({ consumed, quota }: QuotaGaugeProps) {
  const t = useTranslations('contracts');
  const percent = quota > 0 ? Math.min((consumed / quota) * 100, 100) : 0;
  const isOver = consumed > quota;
  const remaining = Math.max(0, quota - consumed);

  const getColor = () => {
    if (isOver) return 'bg-destructive';
    if (percent > 80) return 'bg-[oklch(0.795_0.155_80)]';
    if (percent > 50) return 'bg-[oklch(0.795_0.155_80)]';
    return 'bg-[oklch(0.700_0.165_155)]/120';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('quotaTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {consumed.toFixed(1)}h / {quota.toFixed(0)}h
            </span>
            <span className={`font-medium ${isOver ? 'text-destructive' : ''}`}>
              {percent.toFixed(0)}%
            </span>
          </div>

          <div className="w-full bg-muted rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all ${getColor()}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{quota.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">{t('quotaLabel')}</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${isOver ? 'text-destructive' : ''}`}>
                {consumed.toFixed(1)}
              </p>
              <p className="text-xs text-muted-foreground">{t('quotaConsumed')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[oklch(0.700_0.165_155)]">{remaining.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">{t('quotaRemaining')}</p>
            </div>
          </div>

          {isOver && (
            <div className="p-3 bg-destructive/12 text-destructive rounded text-sm">
              {t('quotaOverage', { hours: (consumed - quota).toFixed(1) })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
