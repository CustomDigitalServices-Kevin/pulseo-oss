'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requestAccountDeletion } from '@/actions/rgpd';

interface ExistingRequest {
  id: string;
  status: string;
  requested_at: string; // ISO string serialised from server
  processed_at: string | null;
}

interface RgpdActionsProps {
  initialRequests: ExistingRequest[];
}

export function RgpdActions({ initialRequests }: RgpdActionsProps) {
  const t = useTranslations('rgpd');
  const [requests, setRequests] = useState<ExistingRequest[]>(initialRequests);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const hasActive = requests.some((r) => r.status === 'pending' || r.status === 'processing');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await requestAccountDeletion({ reason: reason.trim() || undefined });
      if (result.success && result.data) {
        setFeedback({ type: 'success', msg: t('requestSubmitted') });
        setReason('');
        setRequests((prev) => [
          ...prev,
          {
            id: result.data!.requestId,
            status: 'pending',
            requested_at: new Date().toISOString(),
            processed_at: null,
          },
        ]);
      } else {
        setFeedback({
          type: 'error',
          msg: result.success ? t('requestError') : result.error,
        });
      }
    });
  };

  return (
    <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
      <header className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">{t('deletionTitle')}</h2>
          <p className="text-[13px] text-foreground-muted mt-1 leading-relaxed">
            {t('deletionIntro')}
          </p>
        </div>
      </header>

      {requests.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[13px] font-medium text-foreground-muted">
            {t('existingRequestsTitle')}
          </p>
          {requests.map((r) => (
            <div
              key={r.id}
              className="text-[13px] flex items-center gap-2 px-3 py-2 rounded-md bg-canvas border border-border"
            >
              <StatusBadge status={r.status} />
              <span className="text-foreground-subtle tabular-nums">
                {new Date(r.requested_at).toLocaleString('fr-FR', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      {!hasActive && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="rgpd-reason" className="block text-[13px] text-foreground-muted mb-1.5">
              {t('reasonLabel')}
              <span className="text-foreground-subtle ml-1">({t('reasonOptional')})</span>
            </label>
            <textarea
              id="rgpd-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full text-[13px] rounded-md border border-border bg-canvas p-2 focus:outline-none focus:ring-2 focus:ring-destructive/40"
              placeholder={t('reasonPlaceholder')}
              disabled={pending}
            />
            <p className="text-[11px] text-foreground-subtle mt-1 tabular-nums text-right">
              {reason.length} / 2000
            </p>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-destructive text-destructive-foreground text-[13px] font-medium hover:bg-destructive/90 disabled:opacity-60 transition-colors"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {t('submitDeletion')}
          </button>
        </form>
      )}

      {feedback && (
        <div
          className={
            feedback.type === 'success'
              ? 'mt-3 text-[13px] flex items-center gap-2 text-foreground'
              : 'mt-3 text-[13px] flex items-center gap-2 text-destructive'
          }
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      <p className="mt-4 text-[12px] text-foreground-subtle leading-relaxed">
        {t('deletionLegalNote')}
      </p>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    pending: { label: 'En attente', color: 'oklch(0.795 0.155 80)' },
    processing: { label: 'En cours', color: 'oklch(0.700 0.165 230)' },
    completed: { label: 'Traitée', color: 'oklch(0.700 0.165 155)' },
    rejected: { label: 'Refusée', color: 'oklch(0.685 0.205 25)' },
  };
  const meta = labels[status] ?? { label: status, color: 'oklch(0.560 0.010 270)' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
      style={{
        color: meta.color,
        borderColor: `color-mix(in oklch, ${meta.color} 40%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${meta.color} 12%, transparent)`,
      }}
    >
      {meta.label}
    </span>
  );
}
