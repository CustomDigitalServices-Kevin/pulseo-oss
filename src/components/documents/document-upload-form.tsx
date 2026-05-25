'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { uploadDocument } from '@/actions/documents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  DollarSign,
} from 'lucide-react';

interface DocumentUploadFormProps {
  orgId: string;
}

export function DocumentUploadForm({ orgId }: DocumentUploadFormProps) {
  const router = useRouter();
  const t = useTranslations('documents');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [docType, setDocType] = useState('other');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('organization_id', orgId);
    formData.set('type', docType);

    const result = await uploadDocument(formData);

    if (result.success) {
      setSuccess(true);
      form.reset();
      setDocType('other');
      router.refresh();
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error || t('uploadError'));
    }

    setIsSubmitting(false);
  };

  return (
    <Card className="border-0 shadow-premium-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="w-4 h-4 text-muted-foreground" />
          {t('uploadTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-destructive/8 border border-destructive/20 text-destructive rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2.5 p-3 bg-[oklch(0.700_0.165_155)]/12 border border-[oklch(0.700_0.165_155)]/30 text-[oklch(0.700_0.165_155)] rounded-lg text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {t('uploadSuccess')}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                {t('titleField')}
              </Label>
              <Input
                id="title"
                name="title"
                placeholder={t('titlePlaceholder')}
                className="h-10"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('typeField')}</Label>
              <Select
                value={docType}
                onValueChange={(v: string | null) => v && setDocType(v)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">{t('typeInvoice')}</SelectItem>
                  <SelectItem value="quote">{t('typeQuote')}</SelectItem>
                  <SelectItem value="report">{t('typeReport')}</SelectItem>
                  <SelectItem value="other">{t('typeOther')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                {t('amountField')}
              </Label>
              <div className="relative">
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="h-10 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">EUR</span>
              </div>
              <p className="text-[13px] text-muted-foreground">{t('amountOptional')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file" className="text-sm font-medium">{t('fileField')}</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                className="h-10 file:mr-3 file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-medium file:rounded-md file:px-3 file:py-1"
                required
              />
              <p className="text-[13px] text-muted-foreground">{t('fileHint')}</p>
            </div>
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('uploading')}
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                {t('uploadAction')}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
