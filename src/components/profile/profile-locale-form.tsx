'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updateLocale } from '@/actions/profile';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SupportedLocale } from '@/lib/validations/profile';

interface Props {
  current: SupportedLocale;
}

const LOCALES: Array<{ value: SupportedLocale; label: string; flag: string }> = [
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];

export function ProfileLocaleForm({ current }: Props) {
  const t = useTranslations('profile');
  const [selected, setSelected] = useState<SupportedLocale>(current);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (selected === current) return;
    setState('saving');
    setError(null);
    const res = await updateLocale({ locale: selected });
    if (!res.success) {
      setState('error');
      setError(res.error);
      return;
    }
    setState('saved');
    // Hard reload obligatoire : router.refresh() re-render les RSC enfants
    // mais le root layout async (qui lit le cookie via getLocale() et passe
    // les messages au NextIntlClientProvider) n'est pas ré-exécuté en
    // pratique avec Next.js 16 + App Router. Un window.location.reload()
    // garantit que le cookie fraîchement posé est lu côté serveur et que
    // le provider i18n est re-bound avec les nouveaux messages.
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-canvas p-4 flex items-center gap-3">
        <Globe className="w-4 h-4 text-foreground-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-foreground-subtle">{t('localeTitle')}</p>
          <p className="text-[14px] font-medium text-foreground">
            {t('localeDesc')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[13px]">{t('localeChoice')}</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {LOCALES.map((l) => {
            const isActive = selected === l.value;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => setSelected(l.value)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                  isActive
                    ? 'border-primary/50 bg-primary/8 ring-1 ring-primary/25'
                    : 'border-border bg-canvas hover:border-border-strong hover:bg-elevated',
                )}
              >
                <span className="text-[22px]">{l.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-foreground">{l.label}</p>
                  <p className="text-[12px] text-foreground-subtle font-mono">{l.value}</p>
                </div>
                {isActive && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={onSave}
          disabled={selected === current || state === 'saving'}
          className="gap-2"
        >
          {state === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {state === 'saved' && <CheckCircle2 className="w-3.5 h-3.5" />}
          {state === 'saved' ? t('localeApplied') : t('localeApply')}
        </Button>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
      </div>
    </div>
  );
}
