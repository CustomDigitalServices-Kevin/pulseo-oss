'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { deleteDocument } from '@/actions/documents';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentActionsProps {
  documentId: string;
}

export function DocumentActions({ documentId }: DocumentActionsProps) {
  const router = useRouter();
  const t = useTranslations('documents');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm(t('confirmDelete'))) return;

    setLoading(true);
    const result = await deleteDocument(documentId);
    setLoading(false);

    if (result.success) {
      toast.success(t('deleted'));
      router.refresh();
    } else {
      toast.error(result.error || t('deleteError'));
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Trash2 className="w-4 h-4" />
      )}
    </Button>
  );
}
