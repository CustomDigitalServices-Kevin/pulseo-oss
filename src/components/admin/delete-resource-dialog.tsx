'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type DeleteResult = { ok: boolean; error?: string };

export interface DeleteResourceDialogProps {
  /** Label du type de ressource : "groupe", "équipe", "organisation". */
  resourceKind: string;
  /** Genre grammatical pour accorder l'article. */
  resourceGender?: 'm' | 'f';
  /** Nom affichable à retaper pour confirmer. */
  resourceName: string;
  /** Serveur action safe-return. */
  onDelete: () => Promise<DeleteResult>;
  /** URL de redirection après succès. */
  redirectTo: string;
  /** Liste des effets de bord à prévenir l'utilisateur. */
  warnings: string[];
  /** Taille du bouton trigger. */
  size?: 'sm' | 'default';
  /** Classe additionnelle pour le bouton trigger. */
  className?: string;
}

export function DeleteResourceDialog({
  resourceKind,
  resourceGender = 'm',
  resourceName,
  onDelete,
  redirectTo,
  warnings,
  size = 'sm',
  className,
}: DeleteResourceDialogProps) {
  const router = useRouter();
  const t = useTranslations('admin');
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const article = resourceGender === 'f' ? 'cette' : 'ce';

  const reset = () => {
    setTyped('');
    setError(null);
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    setOpen(next);
  };

  const matches = typed.trim() === resourceName;

  const handleConfirm = async () => {
    if (!matches) {
      setError(t('deleteDialogConfirmPrompt', { article, kind: resourceKind }));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onDelete();
    setSubmitting(false);
    if (result.ok) {
      const capKind = `${resourceKind[0]!.toUpperCase()}${resourceKind.slice(1)}`;
      toast.success(
        resourceGender === 'f'
          ? t('deleteDialogToastF', { kind: capKind })
          : t('deleteDialogToast', { kind: capKind }),
      );
      reset();
      setOpen(false);
      startTransition(() => {
        router.push(redirectTo);
        router.refresh();
      });
    } else {
      setError(result.error ?? t('deleteDialogGenericError'));
    }
  };

  const triggerLabel =
    resourceGender === 'f'
      ? t('deleteDialogTriggerF', { kind: resourceKind })
      : t('deleteDialogTriggerM', { kind: resourceKind });
  const titleLabel =
    resourceGender === 'f'
      ? t('deleteDialogTitleF', { kind: resourceKind, name: resourceName })
      : t('deleteDialogTitleM', { kind: resourceKind, name: resourceName });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size={size}
            className={className ?? 'gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive'}
          />
        }
      >
        <Trash2 className="w-3.5 h-3.5" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            {titleLabel}
          </DialogTitle>
          <DialogDescription
            dangerouslySetInnerHTML={{ __html: t('deleteDialogDescription') }}
          />
        </DialogHeader>

        <ul className="list-disc pl-5 text-[14px] text-foreground-muted space-y-1">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>

        <div className="space-y-2 mt-2">
          <Label htmlFor="confirm-name" className="text-[14px]">
            {t('deleteDialogConfirmHint')}{' '}
            <code className="px-1 py-0.5 rounded bg-elevated border border-border font-mono text-[13px]">
              {resourceName}
            </code>
          </Label>
          <Input
            id="confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={resourceName}
            autoComplete="off"
            aria-invalid={typed.length > 0 && !matches}
          />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[14px] text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting || isPending}>
            {t('deleteDialogCancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!matches || submitting || isPending}
            className="gap-1.5"
          >
            {(submitting || isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <Trash2 className="w-3.5 h-3.5" />
            {t('deleteDialogConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
