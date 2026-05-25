'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { updateEmail } from '@/actions/profile';
import { updateEmailSchema, type UpdateEmail } from '@/lib/validations/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';

interface Props {
  currentEmail: string;
}

export function ProfileEmailForm({ currentEmail }: Props) {
  const t = useTranslations('profile');
  const [state, setState] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateEmail>({
    resolver: zodResolver(updateEmailSchema),
    defaultValues: { newEmail: '' },
  });

  const onSubmit = async (data: UpdateEmail) => {
    setState('saving');
    setMessage(null);
    const res = await updateEmail(data);
    if (!res.success) {
      setState('error');
      setMessage(res.error);
      return;
    }
    setState('sent');
    setMessage(t('emailSent'));
    reset();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-canvas p-4 flex items-center gap-3">
        <Mail className="w-4 h-4 text-foreground-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-foreground-subtle">{t('currentEmail')}</p>
          <p className="text-[14px] font-medium text-foreground truncate">{currentEmail}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="newEmail" className="text-[13px]">
            {t('newEmail')}
          </Label>
          <Input
            id="newEmail"
            type="email"
            {...register('newEmail')}
            placeholder={t('newEmailPlaceholder')}
            className="bg-canvas dark:bg-canvas h-10"
          />
          {errors.newEmail && (
            <p className="text-[13px] text-destructive">{errors.newEmail.message}</p>
          )}
          <p className="text-[13px] text-foreground-subtle">
            {t('emailVerificationHint')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={state === 'saving'} className="gap-2">
            {state === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {state === 'sent' ? t('emailResendVerification') : t('emailSendVerification')}
          </Button>
          {message && (
            <p
              className={
                'text-[13px] flex items-center gap-1.5 ' +
                (state === 'sent' ? 'text-[oklch(0.700_0.165_155)]' : 'text-destructive')
              }
            >
              {state === 'sent' ? (
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
