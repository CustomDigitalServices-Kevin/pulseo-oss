'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createProjectSchema, PROJECT_TYPES, PROJECT_STATUSES,
  type CreateProjectInput,
} from '@/modules/projects/lib/validations/projects';
import { createProject, updateProject } from '@/modules/projects/actions/projects';

type Props = {
  orgSlug: string;
  organizationId: string;
} & (
  | { mode: 'create'; defaults?: Partial<CreateProjectInput> }
  | { mode: 'edit'; defaults: Partial<CreateProjectInput> & { id: string } }
);

export function ProjectForm(props: Props) {
  const { orgSlug, organizationId, mode, defaults } = props;
  const router = useRouter();
  const t = useTranslations('projects.form');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { control, register, handleSubmit, formState: { errors } } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: defaults?.name ?? '',
      type: defaults?.type ?? 'dev',
      status: defaults?.status ?? 'chiffrage',
      description: defaults?.description,
      started_at: defaults?.started_at,
      target_date: defaults?.target_date,
    },
  });

  const onSubmit = (data: CreateProjectInput) => startTransition(async () => {
    setError(null);
    const r = props.mode === 'create'
      ? await createProject({ ...data, organizationId })
      : await updateProject(props.defaults.id, data);
    if (!r.success) {
      setError(r.error);
      toast.error(r.error === 'forbidden' ? t('forbidden') : t('saveError'));
      return;
    }
    toast.success(mode === 'create' ? t('toastCreated') : t('toastUpdated'));
    router.push(`/clients/${orgSlug}/projects`);
    router.refresh();
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-xl">
      <div>
        <label className="mb-1 block text-sm font-medium">{t('nameLabel')}</label>
        <Input {...register('name')} />
        {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t('typeLabel')}</label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t('statusLabel')}</label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">{t('descriptionLabel')}</label>
        <Textarea {...register('description')} rows={4} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>{t('cancel')}</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t('saving') : mode === 'create' ? t('create') : t('update')}
        </Button>
      </div>
    </form>
  );
}
