"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Download, Trash2, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  uploadDocument,
  softDeleteDocument,
} from "@/modules/projects/actions/documents";
import type { ProjDocument } from "@/modules/projects/schema/tables";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MAX_BYTES,
  type DocumentCategory,
} from "@/modules/projects/lib/validations/documents";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  projectId: string;
  initialDocuments: ProjDocument[];
};

export function DocumentsTab({ projectId, initialDocuments }: Props) {
  const router = useRouter();
  const t = useTranslations("projects.documents");
  const [docs, setDocs] = useState<ProjDocument[]>(initialDocuments);
  const [category, setCategory] = useState<DocumentCategory>("cdc");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CATEGORY_LABELS: Record<DocumentCategory, string> = {
    cdc: t("categoryCdc"),
    spec_tech: t("categorySpecTech"),
    doc_user: t("categoryDocUser"),
    devis: t("categoryDevis"),
    facture: t("categoryFacture"),
    recette: t("categoryRecette"),
    autre: t("categoryAutre"),
  };

  const handleFile = (file: File) => {
    if (file.size > DOCUMENT_MAX_BYTES) {
      toast.error(t("fileTooLarge", { size: formatBytes(DOCUMENT_MAX_BYTES) }));
      return;
    }
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("category", category);
    fd.set("file", file);
    startTransition(async () => {
      const r = await uploadDocument(fd);
      if (!r.success) {
        toast.error(
          r.error === "file_too_large"
            ? t("uploadErrorTooLarge")
            : r.error === "mime_not_allowed"
              ? t("uploadErrorMime")
              : t("uploadErrorOther"),
        );
        return;
      }
      toast.success(t("uploaded"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{t("title")}</h3>
          <p className="text-sm text-foreground-muted">
            {t("subtitle", { count: docs.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as DocumentCategory)}
          >
            <SelectTrigger className="h-9 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            disabled={isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 mr-1" />
            )}
            {t("upload")}
          </Button>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-foreground-muted">
          {t("emptyHint")}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-elevated/50 text-foreground-subtle text-[13px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  {t("tableCategory")}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {t("tableFile")}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {t("tableSize")}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {t("tableUploaded")}
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("tableActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-elevated/30">
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[12px]">
                      {CATEGORY_LABELS[d.category as DocumentCategory] ??
                        d.category}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-foreground-subtle shrink-0" />
                      <span className="truncate max-w-[280px]">
                        {d.original_name}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-foreground-muted">
                    {formatBytes(Number(d.size_bytes))}
                  </td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {new Date(d.uploaded_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/api/projects/documents/${d.id}/download`}
                        className="inline-flex h-7 items-center justify-center rounded-md px-2 hover:bg-elevated/60 transition"
                        aria-label={t("downloadAria")}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <DeleteDocButton
                        documentId={d.id}
                        onDeleted={() =>
                          setDocs((prev) => prev.filter((x) => x.id !== d.id))
                        }
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

function DeleteDocButton({
  documentId,
  onDeleted,
}: {
  documentId: string;
  onDeleted: () => void;
}) {
  const t = useTranslations("projects.documents");
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      aria-label={t("deleteAria")}
      onClick={() => {
        if (!confirm(t("confirmDelete"))) return;
        startTransition(async () => {
          const r = await softDeleteDocument(documentId);
          if (!r.success) {
            toast.error(t("deleteError"));
            return;
          }
          toast.success(t("deleted"));
          onDeleted();
        });
      }}
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Trash2 className="w-3.5 h-3.5" />
      )}
    </Button>
  );
}
