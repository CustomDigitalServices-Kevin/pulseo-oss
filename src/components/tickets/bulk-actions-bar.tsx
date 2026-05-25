'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { bulkUpdateTicketStatus } from '@/actions/tickets';
import { TicketStatusLabels, type TicketStatusType } from '@/types';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
}

const STATUS_OPTIONS: TicketStatusType[] = [
  'new',
  'in_progress',
  'waiting_client',
  'resolved',
  'closed',
];

/**
 * Floating bulk actions bar that appears when one or more tickets are selected.
 * Currently supports bulk status update; designed to be extensible.
 */
export function BulkActionsBar({ selectedIds, onClear }: BulkActionsBarProps) {
  const router = useRouter();
  const t = useTranslations('ticket');
  const [newStatus, setNewStatus] = useState<TicketStatusType | ''>('');
  const [loading, setLoading] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleApply = async () => {
    if (!newStatus) {
      toast.error(t('bulkChooseStatus'));
      return;
    }
    setLoading(true);
    const result = await bulkUpdateTicketStatus({
      ticket_ids: selectedIds,
      status: newStatus,
    });
    setLoading(false);

    if (result.success) {
      const updated = result.data?.updated ?? selectedIds.length;
      toast.success(t('bulkUpdated', { count: updated }));
      onClear();
      router.refresh();
    } else {
      toast.error(result.error ?? t('bulkUpdateError'));
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in">
      <div className="flex items-center gap-3 px-4 py-3 bg-card border shadow-premium-lg rounded-2xl">
        <div className="flex items-center gap-2 pr-3 border-r">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold">
            {selectedIds.length}
          </span>
          <span className="text-sm font-medium">
            {t('bulkSelectedShort', { count: selectedIds.length })}
          </span>
        </div>

        <Select
          value={newStatus}
          onValueChange={(v) => setNewStatus(v as TicketStatusType)}
        >
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder={t('bulkChangeStatusPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {TicketStatusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          onClick={handleApply}
          disabled={loading || !newStatus}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {t('bulkApply')}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="text-muted-foreground"
          aria-label={t('bulkCancelSelection')}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
