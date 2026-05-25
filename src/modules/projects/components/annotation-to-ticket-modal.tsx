'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createTicketLinkFromAnnotation } from '@/modules/projects/actions/ticket-links';
import type { PreviewAnnotation } from '@/modules/projects/lib/annotation-schema';

/**
 * Modal "Créer un ticket depuis une annotation preview".
 *
 * Props :
 *  - annotation : cible (flow node, pdf rect, etc.)
 *  - projectId : projet auquel le ticket sera lié
 *  - onClose : fermeture modal (cancel ou success)
 *
 * Server Action crée le ticket + le lien en transaction atomique.
 */
export function AnnotationToTicketModal({
  projectId,
  annotation,
  onClose,
}: {
  projectId: string;
  annotation: PreviewAnnotation;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('projects.annotation');
  const [title, setTitle] = useState(() => defaultTitle(annotation));
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (title.trim().length < 3) {
      toast.error(t('titleTooShort'));
      return;
    }
    if (description.trim().length < 1) {
      toast.error(t('descRequired'));
      return;
    }
    startTransition(async () => {
      const r = await createTicketLinkFromAnnotation({
        projectId,
        annotation,
        title: title.trim(),
        description: description.trim(),
        priority,
        category: 'preview-annotation',
      });
      if (!r.success) {
        toast.error(
          r.error === 'deliverable_cross_project' ? t('errorCrossProject')
          : r.error === 'invalid_input' ? t('errorInvalidInput')
          : t('errorCreate', { reason: r.error }),
        );
        return;
      }
      toast.success(t('success', { number: r.data.ticketNumber }));
      router.refresh();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="relative w-full max-w-lg rounded-lg border border-border bg-elevated shadow-xl"
        role="dialog"
        aria-labelledby="annotation-ticket-title"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-elevated/60 transition"
          aria-label={t('closeAria')}
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-5 space-y-4">
          <div>
            <h2 id="annotation-ticket-title" className="text-base font-semibold">
              {t('modalTitle')}
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              {formatAnnotationLabel(annotation)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="annot-title">{t('titleLabel')}</Label>
            <Input
              id="annot-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              maxLength={255}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="annot-desc">{t('descLabel')}</Label>
            <Textarea
              id="annot-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descPlaceholder')}
              rows={4}
              maxLength={10000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="annot-priority">{t('priorityLabel')}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger id="annot-priority" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t('priorityLow')}</SelectItem>
                <SelectItem value="medium">{t('priorityMedium')}</SelectItem>
                <SelectItem value="high">{t('priorityHigh')}</SelectItem>
                <SelectItem value="urgent">{t('priorityUrgent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> {t('creating')}
                </>
              ) : (
                t('submit')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultTitle(annotation: PreviewAnnotation): string {
  switch (annotation.type) {
    case 'flow':
      return `Flow / ${annotation.node_id.replace(/_/g, ' ')}`;
    case 'pdf':
      return `PDF page ${annotation.page}`;
    case 'image':
      return `Image — zone`;
    case 'msapp':
      return `MSAPP / ${annotation.screen_id}${annotation.control_id ? ' / ' + annotation.control_id : ''}`;
    case 'pbix':
      return `PBIX / ${annotation.page_id}${annotation.visual_id ? ' / ' + annotation.visual_id : ''}`;
    case 'solution':
      return `Solution / ${annotation.component_type} / ${annotation.component_id}`;
  }
}

function formatAnnotationLabel(annotation: PreviewAnnotation): string {
  switch (annotation.type) {
    case 'flow':
      return `Annotation flow · node « ${annotation.node_id} »`;
    case 'pdf':
      return `Annotation PDF · page ${annotation.page} · rect ${annotation.rect.w}×${annotation.rect.h}`;
    case 'image':
      return `Annotation image · rect ${annotation.rect.w}×${annotation.rect.h}`;
    case 'msapp':
      return `Annotation MSAPP · écran « ${annotation.screen_id} »${annotation.control_id ? ' · contrôle ' + annotation.control_id : ''}`;
    case 'pbix':
      return `Annotation PBIX · page « ${annotation.page_id} »${annotation.visual_id ? ' · visual ' + annotation.visual_id : ''}`;
    case 'solution':
      return `Annotation solution · ${annotation.component_type} « ${annotation.component_id} »`;
  }
}
