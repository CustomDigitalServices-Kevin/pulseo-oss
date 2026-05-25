'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { terminateContract } from '@/actions/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Contract } from '@/types';

interface ContractActionsProps {
  contract: Contract;
}

export function ContractActions({ contract }: ContractActionsProps) {
  const router = useRouter();
  const t = useTranslations('contracts');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTerminate = async () => {
    if (!confirm(t('confirmTerminate'))) return;

    setLoading(true);
    setError(null);

    const result = await terminateContract({ contract_id: contract.id });

    if (result.success) {
      router.refresh();
    } else {
      setError(result.error || t('genericError'));
    }

    setLoading(false);
  };

  if (contract.status !== 'active') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('actionsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('actionsInactive')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('actionsTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded text-sm">
            {error}
          </div>
        )}

        <Button
          variant="destructive"
          className="w-full"
          onClick={handleTerminate}
          disabled={loading}
        >
          {loading ? t('actionsTerminating') : t('actionsTerminate')}
        </Button>
      </CardContent>
    </Card>
  );
}
