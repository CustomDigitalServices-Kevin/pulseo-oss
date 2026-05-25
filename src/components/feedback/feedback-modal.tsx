'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createFeedback } from '@/actions/feedback';
import {
  createFeedbackSchema,
  type CreateFeedback,
  type CreateFeedbackInput,
} from '@/lib/validations/feedback';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackModal({ open, onOpenChange }: Props) {
  const t = useTranslations('feedback');
  const tCommon = useTranslations('common');
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateFeedbackInput, unknown, CreateFeedback>({
    resolver: zodResolver(createFeedbackSchema),
    defaultValues: {
      type: 'feature',
      title: '',
      description: '',
      organization_id: null,
    },
  });

  const type = watch('type');

  const onSubmit = async (data: CreateFeedback) => {
    setSubmitState('saving');
    setFormError(null);
    const res = await createFeedback(data);
    if (!res.success) {
      setSubmitState('error');
      setFormError(res.error);
      return;
    }
    setSubmitState('sent');
    setTimeout(() => {
      reset();
      setSubmitState('idle');
      onOpenChange(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-xl !w-[92vw] sm:!max-w-xl p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 py-4 border-b border-border flex-row items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <DialogTitle className="text-[15px]">{t('modalTitle')}</DialogTitle>
            <DialogDescription className="text-[13px] text-foreground-subtle">
              {t('modalDesc')}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label={tCommon('close')}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {/* Type radio cards */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-foreground-muted">{t('type')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setValue('type', 'feature', { shouldValidate: true })}
                className={cn(
                  'flex items-start gap-2.5 p-3 rounded-lg border transition-colors text-left',
                  type === 'feature'
                    ? 'border-[oklch(0.680_0.180_310)]/60 bg-[oklch(0.680_0.180_310)]/10 ring-1 ring-[oklch(0.680_0.180_310)]/30'
                    : 'border-border bg-canvas hover:border-border-strong hover:bg-elevated',
                )}
              >
                <Sparkles className={cn('w-4 h-4 shrink-0 mt-0.5', type === 'feature' ? 'text-[oklch(0.680_0.180_310)]' : 'text-foreground-subtle')} />
                <div>
                  <p className="text-[13px] font-medium text-foreground">{t('typeFeature')}</p>
                  <p className="text-[12px] text-foreground-subtle">{t('typeFeatureDesc')}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setValue('type', 'bug', { shouldValidate: true })}
                className={cn(
                  'flex items-start gap-2.5 p-3 rounded-lg border transition-colors text-left',
                  type === 'bug'
                    ? 'border-[oklch(0.685_0.205_25)]/60 bg-[oklch(0.685_0.205_25)]/10 ring-1 ring-[oklch(0.685_0.205_25)]/30'
                    : 'border-border bg-canvas hover:border-border-strong hover:bg-elevated',
                )}
              >
                <Bug className={cn('w-4 h-4 shrink-0 mt-0.5', type === 'bug' ? 'text-[oklch(0.685_0.205_25)]' : 'text-foreground-subtle')} />
                <div>
                  <p className="text-[13px] font-medium text-foreground">{t('typeBug')}</p>
                  <p className="text-[12px] text-foreground-subtle">{t('typeBugDesc')}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="feedback-title" className="text-[13px]">
              {t('title')}
            </Label>
            <Input
              id="feedback-title"
              {...register('title')}
              placeholder={type === 'bug' ? t('titlePlaceholderBug') : t('titlePlaceholderFeature')}
              className="bg-canvas dark:bg-canvas h-10"
              maxLength={200}
            />
            {errors.title && <p className="text-[13px] text-destructive">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="feedback-description" className="text-[13px]">
              {t('description')}
            </Label>
            <Textarea
              id="feedback-description"
              {...register('description')}
              placeholder={
                type === 'bug'
                  ? t('descriptionPlaceholderBug')
                  : t('descriptionPlaceholderFeature')
              }
              className="bg-canvas dark:bg-canvas text-[13px] min-h-[120px]"
              maxLength={5000}
            />
            {errors.description && (
              <p className="text-[13px] text-destructive">{errors.description.message}</p>
            )}
            <p className="text-[12px] text-foreground-subtle tabular-nums text-right">
              {(watch('description') ?? '').length} / 5000
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-border">
            {submitState === 'sent' ? (
              <p className="text-[13px] text-[oklch(0.700_0.165_155)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('thanks')}
              </p>
            ) : formError ? (
              <p className="text-[13px] text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {formError}
              </p>
            ) : (
              <p className="text-[13px] text-foreground-subtle">
                {t('metaHint')}
              </p>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitState === 'saving'}
              >
                {tCommon('cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={submitState === 'saving' || submitState === 'sent'} className="gap-2">
                {submitState === 'saving' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {t('send')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
