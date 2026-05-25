'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { uploadAttachment } from '@/actions/attachments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload } from 'lucide-react';

interface TicketAttachmentUploadProps {
  ticketId: string;
}

export function TicketAttachmentUpload({ ticketId }: TicketAttachmentUploadProps) {
  const router = useRouter();
  const t = useTranslations('ticket');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadAttachment(ticketId, formData);

    if (result.success) {
      router.refresh();
    } else {
      setError(result.error || t('attachmentUploadError'));
    }

    setLoading(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('attachmentAdd')}</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded text-sm mb-4">
            {error}
          </div>
        )}

        <div
          onDragOver={handleDragOver}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
            dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">
            {loading ? t('attachmentUploadInProgress') : t('attachmentUploadDrop')}
          </p>
          <p className="text-xs text-muted-foreground mb-4">{t('attachmentUploadOr')}</p>

          <label className="cursor-pointer">
            <span className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-9 px-4">
              {t('attachmentSelectFile')}
            </span>
            <input
              type="file"
              hidden
              disabled={loading}
              onChange={(e) =>
                e.target.files?.[0] && handleFile(e.target.files[0])
              }
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.doc,.docx"
            />
          </label>

          <p className="text-xs text-muted-foreground mt-4">
            {t('attachmentMaxSize')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
