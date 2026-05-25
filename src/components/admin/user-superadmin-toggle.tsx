'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { setSuperadmin } from '@/actions/admin-users';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Props {
  userId: string;
  isSuperadmin: boolean;
  isSelf: boolean;
}

export function UserSuperadminToggle({ userId, isSuperadmin, isSelf }: Props) {
  const router = useRouter();
  const t = useTranslations('admin');
  const [optimistic, setOptimistic] = useState(isSuperadmin);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    if (isSelf && optimistic) {
      toast.error(t('superadminSelfToast'));
      return;
    }
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await setSuperadmin(userId, next);
        toast.success(next ? t('userPromotedToast') : t('userDemotedToast'));
        router.refresh();
      } catch (err) {
        setOptimistic(!next); // rollback
        const message = err instanceof Error ? err.message : t('genericError');
        toast.error(message);
      }
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={optimistic ? 'destructive' : 'outline'}
      disabled={isPending || (isSelf && optimistic)}
      onClick={handleToggle}
      className="h-8 gap-1.5"
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : optimistic ? (
        <ShieldOff className="w-3.5 h-3.5" />
      ) : (
        <ShieldCheck className="w-3.5 h-3.5" />
      )}
      {optimistic ? t('superadminRemove') : t('superadminPromote')}
    </Button>
  );
}
