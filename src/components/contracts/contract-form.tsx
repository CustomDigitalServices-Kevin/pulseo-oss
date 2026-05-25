'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createContract } from '@/actions/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Clock,
  Calendar,
  DollarSign,
  Loader2,
  Send,
  AlertCircle,
} from 'lucide-react';

const contractFormSchema = z
  .object({
    name: z.string().min(3, 'Nom minimum 3 caracteres').max(200, 'Nom maximum 200 caracteres'),
    description: z.string().max(5000).optional(),
    quota_hours: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Quota invalide (ex: 40 ou 40.50)'),
    rate_per_hour: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Taux invalide (ex: 85.00)'),
    sla_response_hours: z
      .string()
      .optional()
      .refine((v) => !v || /^\d+$/.test(v), 'Heures entieres uniquement'),
    sla_resolution_hours: z
      .string()
      .optional()
      .refine((v) => !v || /^\d+$/.test(v), 'Heures entieres uniquement'),
    start_date: z.string().min(1, 'Date de debut requise'),
    end_date: z.string().min(1, 'Date de fin requise'),
  })
  .refine((data) => data.end_date > data.start_date, {
    message: 'La date de fin doit etre apres la date de debut',
    path: ['end_date'],
  });

type ContractFormValues = z.infer<typeof contractFormSchema>;

interface ContractFormProps {
  slug: string;
  orgId: string;
}

export function ContractForm({ slug, orgId }: ContractFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
  });

  const onSubmit = async (values: ContractFormValues) => {
    setServerError(null);

    const result = await createContract({
      name: values.name,
      organization_id: orgId,
      description: values.description || null,
      quota_hours: values.quota_hours,
      rate_per_hour: values.rate_per_hour,
      sla_response_hours: values.sla_response_hours
        ? Number(values.sla_response_hours)
        : null,
      sla_resolution_hours: values.sla_resolution_hours
        ? Number(values.sla_resolution_hours)
        : null,
      start_date: values.start_date,
      end_date: values.end_date,
    });

    if (result.success && result.data) {
      router.push(`/clients/${slug}/contracts/${result.data.id}`);
    } else {
      setServerError(result.error || 'Erreur creation contrat');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {serverError && (
        <div className="flex items-center gap-2.5 p-3.5 bg-destructive/8 border border-destructive/20 text-destructive rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {serverError}
        </div>
      )}

      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" />
          Identification
        </div>

        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">Nom du contrat</Label>
          <Input
            id="name"
            placeholder="Ex: Support mensuel Premium 2026"
            className="h-11"
            {...register('name')}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          <p className="text-[13px] text-muted-foreground">Nom identifiable pour ce contrat</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-sm font-medium">Description</Label>
          <Textarea
            id="description"
            placeholder="Details du perimetre, conditions particulieres..."
            rows={3}
            className="resize-none leading-relaxed"
            {...register('description')}
          />
          <p className="text-[13px] text-muted-foreground">Optionnel — perimetre et conditions</p>
        </div>
      </div>

      <Separator />

      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <DollarSign className="w-3.5 h-3.5" />
          Tarification
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="quota_hours" className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              Quota heures
            </Label>
            <div className="relative">
              <Input
                id="quota_hours"
                type="number"
                step="0.01"
                min="0"
                placeholder="40"
                className="h-11 pr-8"
                {...register('quota_hours')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">h</span>
            </div>
            {errors.quota_hours && <p className="text-xs text-destructive">{errors.quota_hours.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rate_per_hour" className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              Taux horaire
            </Label>
            <div className="relative">
              <Input
                id="rate_per_hour"
                type="number"
                step="0.01"
                min="0"
                placeholder="85.00"
                className="h-11 pr-12"
                {...register('rate_per_hour')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">EUR/h</span>
            </div>
            {errors.rate_per_hour && <p className="text-xs text-destructive">{errors.rate_per_hour.message}</p>}
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5" />
          SLA (optionnel)
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="sla_response_hours" className="text-sm font-medium">
              Premier contact (h)
            </Label>
            <div className="relative">
              <Input
                id="sla_response_hours"
                type="number"
                step="1"
                min="0"
                placeholder="4"
                className="h-11 pr-8"
                {...register('sla_response_hours')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">h</span>
            </div>
            {errors.sla_response_hours && (
              <p className="text-xs text-destructive">{errors.sla_response_hours.message}</p>
            )}
            <p className="text-[13px] text-muted-foreground">
              Delai avant la premiere reponse d&apos;un gestionnaire
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sla_resolution_hours" className="text-sm font-medium">
              Resolution (h)
            </Label>
            <div className="relative">
              <Input
                id="sla_resolution_hours"
                type="number"
                step="1"
                min="0"
                placeholder="24"
                className="h-11 pr-8"
                {...register('sla_resolution_hours')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">h</span>
            </div>
            {errors.sla_resolution_hours && (
              <p className="text-xs text-destructive">{errors.sla_resolution_hours.message}</p>
            )}
            <p className="text-[13px] text-muted-foreground">
              Delai avant resolution d&apos;un ticket
            </p>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Calendar className="w-3.5 h-3.5" />
          Periode
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="start_date" className="text-sm font-medium">Date de debut</Label>
            <Input id="start_date" type="date" className="h-11" {...register('start_date')} />
            {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date" className="text-sm font-medium">Date de fin</Label>
            <Input id="end_date" type="date" className="h-11" {...register('end_date')} />
            {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
          </div>
        </div>
      </div>

      <Separator />

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-11 text-sm font-medium gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creation en cours...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Creer le contrat
          </>
        )}
      </Button>
    </form>
  );
}
