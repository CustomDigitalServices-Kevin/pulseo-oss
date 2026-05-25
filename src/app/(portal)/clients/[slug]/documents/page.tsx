import { redirect } from "next/navigation";
import { getOrganization } from "@/actions/organizations";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DocumentTypeLabels,
  DocumentSourceLabels,
  type DocumentTypeType,
} from "@/types";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { DocumentActions } from "@/components/documents/document-actions";
import { requireSession } from "@/lib/auth/session";
import { getMemberRole, hasMinRole } from "@/lib/auth/require-role";
import { Download, FileText, AlertCircle, Calendar } from "lucide-react";

const typeStyles: Record<string, string> = {
  invoice: "bg-primary/12 text-primary border-primary/30",
  quote:
    "bg-[oklch(0.680_0.180_310)]/12 text-[oklch(0.680_0.180_310)] border-[oklch(0.680_0.180_310)]/30",
  report:
    "bg-[oklch(0.700_0.165_155)]/12 text-[oklch(0.700_0.165_155)] border-[oklch(0.700_0.165_155)]/30",
  other: "bg-canvas text-foreground-muted border-border",
};

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const type = search.type as string | undefined;
  const t = await getTranslations("clients");
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";

  const orgResult = await getOrganization(slug);
  if (!orgResult.success || !orgResult.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">{t("orgNotFound")}</p>
      </div>
    );
  }

  const org = orgResult.data;

  // Documents are only visible to gestionnaires/admins of the org (a.k.a
  // "responsables"). Viewers are redirected to the tickets page so a
  // stale bookmark or a direct URL does not produce a confusing 404
  // (cohérent avec `contracts/page.tsx:65` qui fait le même redirect).
  const session = await requireSession();
  const memberInfo = await getMemberRole(session.user.id, org.id);
  if (!memberInfo || !hasMinRole(memberInfo.role, "gestionnaire")) {
    redirect(`/clients/${slug}/tickets`);
  }

  const whereConditions = [eq(documents.organization_id, org.id)];
  if (type && type !== "all") {
    whereConditions.push(eq(documents.type, type));
  }

  const docList = await db
    .select()
    .from(documents)
    .where(and(...whereConditions))
    .orderBy(desc(documents.created_at));

  return (
    <div className="space-y-8 p-6 lg:p-8 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("documentsCount", { count: docList.length })}
        </p>
      </div>

      {/* Upload form */}
      <DocumentUploadForm orgId={org.id} />

      {/* Document list */}
      <Card className="border-0 shadow-premium-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            {t("documentsAll")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {docList.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground mt-3">
                {t("documentsEmpty")}
              </p>
            </div>
          ) : (
            <div className="space-y-2 animate-in-stagger">
              {docList.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3.5 border rounded-lg list-item-premium group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* File icon */}
                    <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>

                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {doc.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={typeStyles[doc.type] || typeStyles.other}
                        >
                          {DocumentTypeLabels[doc.type as DocumentTypeType] ||
                            doc.type}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[12px] py-0 h-5"
                        >
                          {DocumentSourceLabels[doc.source] || doc.source}
                        </Badge>
                        {doc.amount && (
                          <span className="text-xs font-mono text-muted-foreground">
                            {parseFloat(doc.amount).toFixed(2)} {doc.currency}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(doc.created_at).toLocaleDateString(dateLocale, {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>

                    {doc.file_key && (
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        download
                        className="inline-flex items-center justify-center rounded-lg text-sm font-medium border border-border bg-background hover:bg-accent h-8 w-8 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <DocumentActions documentId={doc.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
