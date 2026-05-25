'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updateProfile, uploadAvatar } from '@/actions/profile';
import { updateProfileSchema } from '@/lib/validations/profile';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Camera, CheckCircle2, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UpdateProfile, UpdateProfileInput } from '@/lib/validations/profile';

interface Props {
  initial: {
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    avatar_url: string | null;
    email: string;
  };
}

function getInitials(first: string | null, last: string | null, email: string): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  return email[0]?.toUpperCase() ?? '?';
}

export function ProfileIdentityForm({ initial }: Props) {
  const router = useRouter();
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatar_url);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput, unknown, UpdateProfile>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      first_name: initial.first_name ?? '',
      last_name: initial.last_name ?? '',
      job_title: initial.job_title ?? '',
    },
  });

  const onSubmit = async (data: UpdateProfile) => {
    setSaveState('saving');
    setFormError(null);
    const res = await updateProfile(data);
    if (!res.success) {
      setSaveState('error');
      setFormError(res.error);
      return;
    }
    setSaveState('saved');
    router.refresh();
    setTimeout(() => setSaveState('idle'), 1500);
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);

    const fd = new FormData();
    fd.append('avatar', file);
    const res = await uploadAvatar(fd);
    setAvatarUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!res.success) {
      setAvatarError(res.error);
      return;
    }
    const url = (res.data as { url: string } | undefined)?.url ?? null;
    if (url) setAvatarUrl(url);
    router.refresh();
  };

  const initials = getInitials(initial.first_name, initial.last_name, initial.email);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/15 border border-primary/30 flex items-center justify-center text-[24px] font-semibold text-primary">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={t('photoLabel')} className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-premium-md ring-2 ring-background hover:brightness-110 transition-all disabled:opacity-50"
            aria-label={t('changePhoto')}
          >
            {avatarUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleAvatarSelect}
            className="sr-only"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-foreground">{t('photoLabel')}</p>
          <p className="text-[13px] text-foreground-subtle">
            {t('photoHint')}
          </p>
          {avatarError && (
            <p className="mt-1 text-[13px] text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              {avatarError}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="first_name" className="text-[13px]">
            {t('firstName')}
          </Label>
          <Input
            id="first_name"
            {...register('first_name')}
            placeholder="Alex"
            className="bg-canvas dark:bg-canvas h-10"
          />
          {errors.first_name && (
            <p className="text-[13px] text-destructive">{errors.first_name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name" className="text-[13px]">
            {t('lastName')}
          </Label>
          <Input
            id="last_name"
            {...register('last_name')}
            placeholder="Doe"
            className="bg-canvas dark:bg-canvas h-10"
          />
          {errors.last_name && (
            <p className="text-[13px] text-destructive">{errors.last_name.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="job_title" className="text-[13px] flex items-center gap-1.5">
          <User className="w-3 h-3" />
          {t('jobTitle')}
        </Label>
        <Input
          id="job_title"
          {...register('job_title')}
          placeholder="Freelance Power Platform"
          className="bg-canvas dark:bg-canvas h-10"
        />
        {errors.job_title && (
          <p className="text-[13px] text-destructive">{errors.job_title.message}</p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          disabled={!isDirty || saveState === 'saving'}
          className={cn('gap-2', saveState === 'saved' && 'bg-[oklch(0.700_0.165_155)] text-white')}
        >
          {saveState === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saveState === 'saved' && <CheckCircle2 className="w-3.5 h-3.5" />}
          {saveState === 'saved' ? tCommon('saved') : tCommon('save')}
        </Button>
        {formError && (
          <p className="text-[13px] text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" />
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
