'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Clock, XCircle, AlertCircle, Loader2, MessageSquare, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  createRecipeTest,
  changeRecipeStatus,
  addRecipeComment,
  deleteRecipeTest,
  listRecipeEvents,
} from '@/modules/projects/actions/recipe';
import type { ProjRecipeTest, ProjRecipeEvent } from '@/modules/projects/schema/tables';
import { RECIPE_STATUSES, type RecipeStatus } from '@/modules/projects/lib/validations/recipe';

function getStatusLabels(t: (k: string) => string): Record<RecipeStatus, string> {
  return {
    a_faire: t('statusAFaire'),
    en_cours: t('statusEnCours'),
    ok: t('statusOk'),
    ko: t('statusKo'),
    bloque: t('statusBloque'),
  };
}

const STATUS_STYLES: Record<RecipeStatus, { icon: React.ReactNode; badge: string }> = {
  a_faire:  { icon: <Circle className="w-3.5 h-3.5 text-foreground-subtle" />,      badge: 'bg-elevated text-foreground-muted' },
  en_cours: { icon: <Clock className="w-3.5 h-3.5 text-blue-400" />,                 badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  ok:       { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,       badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  ko:       { icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,                badge: 'bg-red-500/15 text-red-300 border-red-500/30' },
  bloque:   { icon: <AlertCircle className="w-3.5 h-3.5 text-amber-400" />,          badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
};

type Props = {
  projectId: string;
  initialTests: ProjRecipeTest[];
};

export function RecipeTab({ projectId, initialTests }: Props) {
  const router = useRouter();
  const t = useTranslations('projects.recipe');
  const [tests, setTests] = useState<ProjRecipeTest[]>(initialTests);
  const [openTimelineId, setOpenTimelineId] = useState<string | null>(null);

  const sortedTests = useMemo(
    () => [...tests].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [tests],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{t('title')}</h3>
          <p className="text-sm text-foreground-muted">
            {t('subtitle', { count: sortedTests.length })}
          </p>
        </div>
        <AddTestButton projectId={projectId} onCreated={() => router.refresh()} />
      </div>

      {sortedTests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-foreground-muted">
          {t('emptyState')}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-elevated/50 text-foreground-subtle text-[13px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('tableNum')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('tableTest')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('tableStatus')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('tableActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedTests.map((row, i) => (
                <tr key={row.id} className="hover:bg-elevated/30">
                  <td className="px-3 py-2 text-foreground-subtle tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.title}</p>
                    {row.expected_result && (
                      <p className="text-xs text-foreground-muted mt-0.5 line-clamp-2">{row.expected_result}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusSelect
                      testId={row.id}
                      current={row.status as RecipeStatus}
                      onChanged={(next) => {
                        setTests((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: next } : x)));
                        router.refresh();
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('openTimeline')}
                        onClick={() => setOpenTimelineId(row.id)}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Button>
                      <DeleteTestButton
                        testId={row.id}
                        onDeleted={() => setTests((prev) => prev.filter((x) => x.id !== row.id))}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openTimelineId && (
        <TimelineDialog
          testId={openTimelineId}
          onClose={() => setOpenTimelineId(null)}
          onCommentAdded={() => router.refresh()}
        />
      )}
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function AddTestButton({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const t = useTranslations('projects.recipe');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [expected, setExpected] = useState('');
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await createRecipeTest({
        projectId,
        title,
        expected_result: expected || null,
      });
      if (!r.success) {
        toast.error(t('createError'));
        return;
      }
      toast.success(t('createOk'));
      setTitle('');
      setExpected('');
      setOpen(false);
      onCreated();
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="w-3.5 h-3.5 mr-1" />
        {t('addTest')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newTestTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('titleLabel')}</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('titlePlaceholder')}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('expectedLabel')}</label>
              <Textarea
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                rows={3}
                placeholder={t('acceptanceCriteria')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button onClick={submit} disabled={isPending || !title.trim()}>
              {isPending ? t('saving') : t('add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusSelect({
  testId,
  current,
  onChanged,
}: {
  testId: string;
  current: RecipeStatus;
  onChanged: (next: RecipeStatus) => void;
}) {
  const t = useTranslations('projects.recipe');
  const statusLabels = getStatusLabels(t);
  const [isPending, startTransition] = useTransition();
  const style = STATUS_STYLES[current];

  return (
    <Select
      value={current}
      onValueChange={(next) => {
        if (next === current) return;
        startTransition(async () => {
          const r = await changeRecipeStatus(testId, { status: next as RecipeStatus });
          if (!r.success) {
            toast.error(t('statusChangeError'));
            return;
          }
          onChanged(next as RecipeStatus);
        });
      }}
    >
      <SelectTrigger
        className={cn(
          'h-7 w-[120px] text-xs border',
          style.badge,
          isPending && 'opacity-60',
        )}
      >
        <span className="flex items-center gap-1.5">
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : style.icon}
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {RECIPE_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <span className="flex items-center gap-2">
              {STATUS_STYLES[s].icon}
              {statusLabels[s]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DeleteTestButton({ testId, onDeleted }: { testId: string; onDeleted: () => void }) {
  const t = useTranslations('projects.recipe');
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={t('deleteTest')}
      disabled={isPending}
      onClick={() => {
        if (!confirm(t('deleteConfirm'))) return;
        startTransition(async () => {
          const r = await deleteRecipeTest(testId);
          if (!r.success) {
            toast.error(t('deleteError'));
            return;
          }
          toast.success(t('deleted'));
          onDeleted();
        });
      }}
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </Button>
  );
}

function TimelineDialog({
  testId,
  onClose,
  onCommentAdded,
}: {
  testId: string;
  onClose: () => void;
  onCommentAdded: () => void;
}) {
  const t = useTranslations('projects.recipe');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const statusLabels = getStatusLabels(t);
  const [events, setEvents] = useState<ProjRecipeEvent[] | null>(null);
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  // Load events on mount
  useMemo(() => {
    startTransition(async () => {
      const r = await listRecipeEvents(testId);
      if (r.success) setEvents(r.data);
    });
  }, [testId]);

  const sendComment = () => {
    if (!note.trim()) return;
    startTransition(async () => {
      const r = await addRecipeComment(testId, { note });
      if (!r.success) {
        toast.error(t('commentSendError'));
        return;
      }
      setNote('');
      // Reload events
      const r2 = await listRecipeEvents(testId);
      if (r2.success) setEvents(r2.data);
      onCommentAdded();
    });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('timelineTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {!events && <p className="text-sm text-foreground-muted">{t('timelineLoading')}</p>}
          {events && events.length === 0 && (
            <p className="text-sm text-foreground-muted">{t('timelineEmpty')}</p>
          )}
          {events?.map((e) => (
            <div key={e.id} className="rounded-md border border-border p-2.5 text-sm">
              <div className="flex items-center gap-2 text-xs text-foreground-subtle mb-1">
                <EventTypeBadge type={e.event_type} />
                <span>{new Date(e.created_at).toLocaleString(dateLocale)}</span>
              </div>
              {e.event_type === 'status_change' && (
                <p className="text-foreground-muted">
                  <span className="font-medium">{statusLabels[e.old_value as RecipeStatus] ?? e.old_value}</span>
                  <span className="mx-1.5">→</span>
                  <span className="font-medium">{statusLabels[e.new_value as RecipeStatus] ?? e.new_value}</span>
                </p>
              )}
              {e.note && <p className="mt-1 whitespace-pre-wrap">{e.note}</p>}
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <label className="block text-xs font-medium text-foreground-muted">{t('addComment')}</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t('observationPlaceholder')}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={sendComment} disabled={isPending || !note.trim()}>
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {t('commentSend')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const t = useTranslations('projects.recipe');
  const labels: Record<string, string> = {
    status_change: t('eventStatus'),
    comment: t('eventComment'),
    assignee_change: t('eventAssignee'),
  };
  return (
    <Badge variant="outline" className="h-4 px-1.5 text-[12px]">
      {labels[type] ?? type}
    </Badge>
  );
}
