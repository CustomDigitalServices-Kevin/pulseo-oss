'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ExportButtonProps {
  href: string;
  label?: string;
}

/**
 * Bouton d'export Excel — variant outline premium avec icône FileSpreadsheet
 * pour signaler le format. Refonte visibilité 2026-04-22 (h-11 + icône verte).
 */
export function ExportButton({ href, label }: ExportButtonProps) {
  const t = useTranslations('common2');
  const [loading, setLoading] = useState(false);
  const resolvedLabel = label ?? t('exportXlsxDefault');

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await fetch(href);
      if (!response.ok) {
        throw new Error(t('exportFetchError'));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? 'export.xlsx';
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success(t('exportDownloaded'));
    } catch {
      toast.error(t('exportError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="xl"
      onClick={handleExport}
      disabled={loading}
      className="gap-2 font-medium"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('exportProgress')}
        </>
      ) : (
        <>
          <span className="relative flex items-center justify-center w-5 h-5 rounded-md bg-[oklch(0.700_0.165_155)]/15 ring-1 ring-[oklch(0.700_0.165_155)]/30">
            <FileSpreadsheet className="w-3 h-3 text-[oklch(0.700_0.165_155)]" strokeWidth={2.5} />
          </span>
          {resolvedLabel}
          <Download className="w-3.5 h-3.5 text-foreground-subtle" />
        </>
      )}
    </Button>
  );
}
