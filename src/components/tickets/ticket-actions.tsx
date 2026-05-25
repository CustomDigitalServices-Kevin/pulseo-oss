'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updateTicketStatus, updateTimeSpent } from '@/actions/tickets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Ticket, TicketStatusLabels, TicketStatusType } from '@/types';
import {
  Settings,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Mail,
  Send,
} from 'lucide-react';

interface TicketActionsProps {
  ticket: Ticket;
  /**
   * True when the viewer can manage the ticket (gestionnaire or admin).
   * Controls visibility of the "time spent" editor and the late-stage
   * status transitions that are no longer available to regular viewers.
   */
  canManage?: boolean;
}

const validTransitions: Record<string, string[]> = {
  new: ['in_progress', 'waiting_client'],
  in_progress: ['waiting_client', 'resolved', 'closed'],
  waiting_client: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
};

const statusIcons: Record<string, string> = {
  in_progress: 'bg-[oklch(0.795_0.155_80)]',
  waiting_client: 'bg-[oklch(0.680_0.180_310)]',
  resolved: 'bg-[oklch(0.700_0.165_155)]',
  closed: 'bg-foreground-subtle',
};

export function TicketActions({ ticket, canManage }: TicketActionsProps) {
  const router = useRouter();
  const t = useTranslations('ticket');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeUnit, setTimeUnit] = useState<'hours' | 'days'>('hours');
  const [timeValue, setTimeValue] = useState(
    ((ticket.time_spent_minutes || 0) / 60).toFixed(1)
  );

  // Status change confirmation dialog
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const transitions = validTransitions[ticket.status] || [];

  const handleStatusSelect = (newStatus: string | null) => {
    if (!newStatus || newStatus === ticket.status) return;
    setPendingStatus(newStatus);
    setSendEmail(true);
    setConfirmOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatus) return;
    setLoading(true);
    setError(null);
    setConfirmOpen(false);

    const result = await updateTicketStatus({
      ticket_id: ticket.id,
      status: pendingStatus,
      notify_by_email: sendEmail,
    });

    if (!result.success) {
      setError(result.error || t('genericError'));
    } else {
      router.refresh();
    }

    setLoading(false);
    setPendingStatus(null);
  };

  const handleCancelStatusChange = () => {
    setConfirmOpen(false);
    setPendingStatus(null);
  };

  const handleTimeUnitChange = (unit: 'hours' | 'days') => {
    const currentMinutes = timeUnit === 'days'
      ? parseFloat(timeValue) * 480
      : parseFloat(timeValue) * 60;
    if (unit === 'days') {
      setTimeValue((currentMinutes / 480).toFixed(2));
    } else {
      setTimeValue((currentMinutes / 60).toFixed(1));
    }
    setTimeUnit(unit);
  };

  const handleTimeUpdate = async () => {
    const parsed = parseFloat(timeValue);
    const minutes = timeUnit === 'days'
      ? Math.round(parsed * 480)
      : Math.round(parsed * 60);
    if (isNaN(minutes) || minutes < 0) return;

    setTimeLoading(true);
    setError(null);

    const result = await updateTimeSpent({
      ticket_id: ticket.id,
      time_spent_minutes: minutes,
    });

    if (!result.success) {
      setError(result.error || t('genericError'));
    } else {
      router.refresh();
    }

    setTimeLoading(false);
  };

  if (transitions.length === 0 && !canManage) {
    return (
      <Card className="border-0 shadow-premium-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {t('actionsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-[oklch(0.700_0.165_155)]" />
            {t('actionsClosedNotice')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingStatusLabel = pendingStatus
    ? TicketStatusLabels[pendingStatus as TicketStatusType] || pendingStatus
    : '';

  return (
    <>
      <Card className="border-0 shadow-premium-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" />
            {t('actionsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-destructive/8 border border-destructive/20 text-destructive rounded-lg text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Status change */}
          {transitions.length > 0 && (
            <div className="space-y-2">
              <label className="text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
                {t('actionsChangeStatus')}
              </label>
              <Select
                value={ticket.status}
                onValueChange={handleStatusSelect}
                disabled={loading}
              >
                <SelectTrigger className="h-10">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-sm">{t('actionsUpdating')}</span>
                    </div>
                  ) : (
                    <SelectValue />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {transitions.map((status) => (
                    <SelectItem key={status} value={status}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${statusIcons[status] || 'bg-foreground-subtle'}`} />
                        {TicketStatusLabels[status as TicketStatusType] || status}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time spent — gestionnaire/admin */}
          {canManage && (
            <div className="space-y-2">
              <label className="text-[13px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {t('actionsTimeSpent')}
              </label>
              {/* Unit toggle */}
              <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => handleTimeUnitChange('hours')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeUnit === 'hours'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('actionsHours')}
                </button>
                <button
                  type="button"
                  onClick={() => handleTimeUnitChange('days')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeUnit === 'days'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('actionsDays')}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    step={timeUnit === 'days' ? '0.25' : '0.1'}
                    min="0"
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    className="h-9 pr-8 font-mono text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                    {timeUnit === 'days' ? 'j' : 'h'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTimeUpdate}
                  disabled={timeLoading}
                  className="h-9 px-3"
                >
                  {timeLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    t('actionsTimeSave')
                  )}
                </Button>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {timeUnit === 'days' ? t('actionsDayEquivHint') : t('actionsTimeVisibleHint')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status change confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) handleCancelStatusChange(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('actionsConfirmTitle', { label: pendingStatusLabel })}
            </DialogTitle>
            <DialogDescription>
              {t('actionsConfirmDescription', { number: ticket.number })}
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              sendEmail ? 'bg-primary border-primary' : 'border-border'
            }`}>
              {sendEmail && <Mail className="w-3 h-3 text-primary-foreground" />}
            </div>
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="sr-only"
            />
            <div>
              <p className="text-sm font-medium">{t('actionsSendEmail')}</p>
              <p className="text-xs text-muted-foreground">
                {t('actionsSendEmailDesc')}
              </p>
            </div>
          </label>

          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" />}
            >
              {t('deleteCancel')}
            </DialogClose>
            <Button
              onClick={handleConfirmStatusChange}
              disabled={loading}
              className="gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {t('actionsConfirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
