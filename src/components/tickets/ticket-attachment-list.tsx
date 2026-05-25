'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { deleteAttachment } from '@/actions/attachments';
import { TicketAttachment } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Trash2, FileText, Image as ImageIcon } from 'lucide-react';

interface TicketAttachmentListProps {
  attachments: TicketAttachment[];
  ticketId: string;
  organizationId: string;
}

export function TicketAttachmentList({
  attachments,
  ticketId,
  organizationId,
}: TicketAttachmentListProps) {
  const router = useRouter();
  const t = useTranslations('ticket');
  const [loading, setLoading] = useState<string | null>(null);

  const handleDelete = async (attachmentId: string) => {
    if (!confirm(t('attachmentConfirmDelete'))) return;

    setLoading(attachmentId);
    const result = await deleteAttachment(attachmentId);
    setLoading(null);

    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5" />;
    return <FileText className="w-5 h-5" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('attachmentsTitle', { count: attachments.length })}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between p-3 border border-border rounded"
            >
              <div className="flex items-center gap-3 flex-1">
                {getFileIcon(attachment.mime_type)}
                <div>
                  <p className="text-sm font-medium">{attachment.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {(attachment.file_size_bytes / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={`/api/files/${organizationId}/tickets/${ticketId}/${attachment.file_key}`}
                  download={attachment.filename}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-8 px-3"
                  aria-label={t('downloadAria', { name: attachment.filename })}
                >
                  <Download className="w-4 h-4" />
                </a>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(attachment.id)}
                  disabled={loading === attachment.id}
                  aria-label={t('deleteAria', { name: attachment.filename })}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
