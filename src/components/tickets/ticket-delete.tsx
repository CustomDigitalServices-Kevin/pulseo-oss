'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { deleteTicket } from '@/actions/tickets';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface TicketDeleteProps {
  ticketId: string;
  ticketNumber: number;
  slug: string;
}

export function TicketDelete({ ticketId, ticketNumber, slug }: TicketDeleteProps) {
  const router = useRouter();
  const t = useTranslations('ticket');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    const result = await deleteTicket(ticketId);

    if (result.success) {
      setOpen(false);
      router.push(`/clients/${slug}/tickets`);
    } else {
      setError(result.error || t('deleteError'));
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          />
        }
      >
        <Trash2 className="w-3.5 h-3.5" />
        {t('deleteTitle')}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">
            {t('deleteConfirm', { number: ticketNumber })}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('deleteWarning')}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/8 border border-destructive/20 text-destructive rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" disabled={loading} />
            }
          >
            {t('deleteCancel')}
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('deleteInProgress')}
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                {t('deleteCta')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
