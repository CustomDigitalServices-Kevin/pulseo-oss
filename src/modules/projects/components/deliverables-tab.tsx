'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  FileBox, Download, Trash2, Upload, Loader2, Star, Eye, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  promoteDeliverableVersion,
  softDeleteDeliverable,
} from '@/modules/projects/actions/deliverables';
import type { ProjDeliverable } from '@/modules/projects/schema/tables';
import {
  DELIVERABLE_SIZE_LIMITS,
  VERSION_REGEX,
  categorizeDeliverable,
} from '@/modules/projects/lib/validations/deliverables';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function isPreviewable(d: { mime_type: string | null; original_name: string | null; preview_status: string | null }): boolean {
  const mime = d.mime_type ?? '';
  const name = d.original_name ?? '';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return true;
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|svg)$/i.test(name)) return true;
  // Flow / MSAPP / Solution / PBIX : preview dispo uniquement si worker a généré le manifest
  if (/\.(zip|msapp|pbix)$/i.test(name) && d.preview_status === 'ready') return true;
  return false;
}

function previewBadge(
  preview_status: string | null,
  labels: { ready: string; pending: string; failed: string },
): { label: string; color: string } | null {
  if (!preview_status) return null;
  if (preview_status === 'ready') return { label: labels.ready, color: 'text-emerald-500' };
  if (preview_status === 'pending') return { label: labels.pending, color: 'text-amber-500' };
  if (preview_status === 'failed') return { label: labels.failed, color: 'text-red-500' };
  return null;
}

type Props = {
  slug: string;
  projectId: string;
  initialDeliverables: ProjDeliverable[];
};

export function DeliverablesTab({ slug, projectId, initialDeliverables }: Props) {
  const router = useRouter();
  const t = useTranslations('projects.deliverables');
  const [items, setItems] = useState<ProjDeliverable[]>(initialDeliverables);
  const [version, setVersion] = useState('1.0');
  const [markAsLatest, setMarkAsLatest] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!VERSION_REGEX.test(version)) {
      toast.error(t('versionInvalid'));
      return;
    }
    const category = categorizeDeliverable(file.name, file.type || 'application/octet-stream');
    const maxBytes = DELIVERABLE_SIZE_LIMITS[category];
    if (file.size > maxBytes) {
      toast.error(t('fileTooLarge', { size: formatBytes(maxBytes), category }));
      return;
    }

    setIsUploading(true);
    setUploadPct(0);

    const params = new URLSearchParams({
      projectId,
      version,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
    });
    if (!markAsLatest) params.set('markAsLatest', 'false');

    try {
      // XHR pour progress tracking (fetch n'a pas upload progress natif)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/projects/deliverables/upload?${params}`);
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadPct(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            const msg = xhr.responseText;
            try {
              const j = JSON.parse(msg);
              reject(new Error(j.error ?? `HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('network_error'));
        xhr.send(file);
      });

      toast.success(t('uploaded'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(
        msg === 'file_too_large' ? t('uploadErrorTooLarge')
        : msg === 'mime_not_allowed' ? t('uploadErrorMime')
        : msg === 'concurrent_upload' ? t('uploadErrorConcurrent')
        : msg === 'forbidden' ? t('uploadErrorForbidden')
        : t('uploadErrorOther', { reason: msg }),
      );
    } finally {
      setIsUploading(false);
      setUploadPct(0);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">{t('title')}</h3>
          <p className="text-sm text-foreground-muted">
            {t('subtitle', { count: items.length })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder={t('versionPlaceholder')}
            className="h-9 w-[100px]"
            aria-label="Version"
          />
          <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <input
              type="checkbox"
              checked={markAsLatest}
              onChange={(e) => setMarkAsLatest(e.target.checked)}
              className="rounded border-border"
            />
            {t('markLatest')}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                {uploadPct > 0 ? `${uploadPct}%` : t('uploadInProgress')}
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 mr-1" />
                {t('upload')}
              </>
            )}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-foreground-muted">
          {t('emptyHint')}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-elevated/50 text-foreground-subtle text-[13px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('tableVersion')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('tableFile')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('tableSize')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('tableUploaded')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('tableActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((d) => (
                <tr key={d.id} className="hover:bg-elevated/30">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Badge variant={d.is_latest ? 'default' : 'outline'} className="text-[12px]">
                        {d.version}
                      </Badge>
                      {d.is_latest && (
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-label={t('latestBadge')} />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <FileBox className="w-3.5 h-3.5 text-foreground-subtle shrink-0" />
                      <span className="truncate max-w-[280px]">{d.original_name ?? '—'}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-foreground-muted">
                    {d.size_bytes ? formatBytes(Number(d.size_bytes)) : '—'}
                  </td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {new Date(d.uploaded_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {previewBadge(d.preview_status, { ready: t('previewReady'), pending: t('previewPending'), failed: t('previewFailed') }) && (
                        <span className={`text-[12px] mr-1 ${previewBadge(d.preview_status, { ready: t('previewReady'), pending: t('previewPending'), failed: t('previewFailed') })!.color}`}>
                          {previewBadge(d.preview_status, { ready: t('previewReady'), pending: t('previewPending'), failed: t('previewFailed') })!.label}
                        </span>
                      )}
                      {isPreviewable(d) && (
                        <Link
                          href={`/clients/${slug}/projects/${projectId}/deliverables/${d.id}/preview`}
                          className="inline-flex h-7 items-center justify-center rounded-md px-2 hover:bg-elevated/60 transition"
                          aria-label={t('previewAria')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                      )}
                      <a
                        href={`/api/projects/deliverables/${d.id}/download`}
                        className="inline-flex h-7 items-center justify-center rounded-md px-2 hover:bg-elevated/60 transition"
                        aria-label={t('downloadAria')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      {!d.is_latest && d.kind === 'file' && (
                        <PromoteButton
                          deliverableId={d.id}
                          onPromoted={() => {
                            setItems((prev) =>
                              prev.map((x) => ({
                                ...x,
                                is_latest: x.id === d.id,
                              })),
                            );
                            router.refresh();
                          }}
                        />
                      )}
                      <DeleteButton
                        deliverableId={d.id}
                        onDeleted={() => {
                          setItems((prev) => prev.filter((x) => x.id !== d.id));
                          router.refresh();
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PromoteButton({
  deliverableId,
  onPromoted,
}: {
  deliverableId: string;
  onPromoted: () => void;
}) {
  const t = useTranslations('projects.deliverables');
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      aria-label={t('promoteAria')}
      onClick={() => {
        startTransition(async () => {
          const r = await promoteDeliverableVersion({ deliverableId });
          if (!r.success) {
            toast.error(t('promoteError'));
            return;
          }
          toast.success(t('promoted'));
          onPromoted();
        });
      }}
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
    </Button>
  );
}

function DeleteButton({
  deliverableId,
  onDeleted,
}: {
  deliverableId: string;
  onDeleted: () => void;
}) {
  const t = useTranslations('projects.deliverables');
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      aria-label={t('deleteAria')}
      onClick={() => {
        if (!confirm(t('confirmDelete'))) return;
        startTransition(async () => {
          const r = await softDeleteDeliverable({ deliverableId });
          if (!r.success) {
            toast.error(t('deleteError'));
            return;
          }
          toast.success(t('deleted'));
          onDeleted();
        });
      }}
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </Button>
  );
}

// Exporté pour future UI "livrables archivés" (superadmin)
export { RotateCcw as RestoreIcon };
