'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { updateFeedbackStatus } from '@/actions/feedback';
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
  type FeedbackType,
} from '@/lib/validations/feedback';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bug,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  id: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  adminNotes: string | null;
  createdAt: Date;
  user: { name: string | null; email: string } | null;
  organization: { name: string; slug: string } | null;
}

const STATUS_META: Record<FeedbackStatus, { labelKey: string; className: string }> = {
  new: { labelKey: 'statusNew', className: 'bg-sky-500/15 text-sky-200 border-sky-500/40' },
  reviewed: { labelKey: 'statusReviewed', className: 'bg-amber-500/15 text-amber-200 border-amber-500/40' },
  accepted: {
    labelKey: 'statusAccepted',
    className: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  },
  rejected: { labelKey: 'statusRejected', className: 'bg-rose-500/15 text-rose-200 border-rose-500/40' },
};

export function FeedbackRow(props: Props) {
  const router = useRouter();
  const t = useTranslations('feedback');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus>(props.status);
  const [notes, setNotes] = useState(props.adminNotes ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const hasChanges = status !== props.status || notes !== (props.adminNotes ?? '');

  const onSave = async () => {
    setSaveState('saving');
    setError(null);
    const res = await updateFeedbackStatus({
      id: props.id,
      status,
      admin_notes: notes.trim().length > 0 ? notes : null,
    });
    if (!res.success) {
      setSaveState('error');
      setError(res.error);
      return;
    }
    setSaveState('saved');
    router.refresh();
    setTimeout(() => setSaveState('idle'), 1500);
  };

  const TypeIcon = props.type === 'bug' ? Bug : Sparkles;
  const typeTint =
    props.type === 'bug' ? 'oklch(0.685 0.205 25)' : 'oklch(0.680 0.180 310)';

  return (
    <div className="rounded-lg border border-border bg-elevated overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-overlay/40 transition-colors"
      >
        <div
          className="shrink-0 w-8 h-8 rounded-md ring-1 flex items-center justify-center"
          style={{
            backgroundColor: `color-mix(in oklch, ${typeTint} 14%, transparent)`,
            borderColor: `color-mix(in oklch, ${typeTint} 28%, transparent)`,
          }}
        >
          <TypeIcon className="w-3.5 h-3.5" style={{ color: typeTint }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center px-2 h-5 rounded text-[11px] font-semibold border',
                STATUS_META[props.status].className,
              )}
            >
              {t(STATUS_META[props.status].labelKey)}
            </span>
            <p className="text-[14px] font-medium text-foreground truncate flex-1">{props.title}</p>
          </div>
          <p className="text-[12px] text-foreground-subtle mt-0.5 tabular-nums">
            {new Date(props.createdAt).toLocaleString(dateLocale)} ·{' '}
            {props.user?.name || props.user?.email || t('anonymous')}
            {props.organization && ` · ${t('orgContext', { name: props.organization.name })}`}
          </p>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-foreground-subtle" />
          ) : (
            <ChevronDown className="w-4 h-4 text-foreground-subtle" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/60 bg-canvas/40 p-4 space-y-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-1.5">
              {t('description')}
            </p>
            <div className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed rounded-md border border-border bg-canvas p-3">
              {props.description}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4 items-start">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-1.5">
                {t('statusLabel')}
              </p>
              <Select value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)}>
                <SelectTrigger className="bg-canvas dark:bg-canvas h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(STATUS_META[s].labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-1.5">
                {t('adminNotesLabel')}
              </p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('adminNotesPlaceholder')}
                className="bg-canvas dark:bg-canvas text-[13px] min-h-[80px]"
                maxLength={5000}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-border">
            {saveState === 'saved' ? (
              <p className="text-[13px] text-[oklch(0.700_0.165_155)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {tCommon('saved')}
              </p>
            ) : error ? (
              <p className="text-[13px] text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {error}
              </p>
            ) : null}
            <Button
              onClick={onSave}
              disabled={!hasChanges || saveState === 'saving'}
              size="sm"
              className="ml-auto gap-2"
            >
              {saveState === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {tCommon('save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
