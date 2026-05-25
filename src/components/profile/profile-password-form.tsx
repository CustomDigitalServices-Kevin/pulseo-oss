'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { setOrChangePassword } from '@/actions/profile';
import { setPasswordSchema, type SetPassword } from '@/lib/validations/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';

interface Props {
  hasPassword: boolean;
}

export function ProfilePasswordForm({ hasPassword }: Props) {
  const t = useTranslations('profile');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SetPassword>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { newPassword: '', currentPassword: '' },
  });

  const onSubmit = async (data: SetPassword) => {
    setState('saving');
    setMessage(null);
    const payload = hasPassword ? data : { newPassword: data.newPassword };
    const res = await setOrChangePassword(payload);
    if (!res.success) {
      setState('error');
      setMessage(res.error);
      return;
    }
    setState('saved');
    setMessage(hasPassword ? t('passwordUpdated') : t('passwordSet'));
    reset();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-canvas p-4 flex items-center gap-3">
        <ShieldCheck className="w-4 h-4 text-[oklch(0.700_0.165_155)] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-foreground-subtle">{t('passwordStatus')}</p>
          <p className="text-[14px] font-medium text-foreground">
            {hasPassword ? t('passwordExists') : t('passwordMissing')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword" className="text-[13px]">
              {t('currentPassword')}
            </Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
              className="bg-canvas dark:bg-canvas h-10"
            />
            {errors.currentPassword && (
              <p className="text-[13px] text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="newPassword" className="text-[13px] flex items-center gap-1.5">
            <KeyRound className="w-3 h-3" />
            {hasPassword ? t('newPasswordChange') : t('newPasswordSet')}
          </Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...register('newPassword')}
            className="bg-canvas dark:bg-canvas h-10"
          />
          {errors.newPassword && (
            <p className="text-[13px] text-destructive">{errors.newPassword.message}</p>
          )}
          <p className="text-[13px] text-foreground-subtle">
            {t('passwordHint')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={state === 'saving'} className="gap-2">
            {state === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {state === 'saved' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {hasPassword ? t('updatePasswordCta') : t('setPasswordCta')}
          </Button>
          {message && (
            <p
              className={
                'text-[13px] flex items-center gap-1.5 ' +
                (state === 'saved' ? 'text-[oklch(0.700_0.165_155)]' : 'text-destructive')
              }
            >
              {state === 'saved' ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertCircle className="w-3 h-3" />
              )}
              {message}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
