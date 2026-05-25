'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createGroup } from '@/actions/groups';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, Send, Layers, Globe, Image as ImageIcon } from 'lucide-react';

export function GroupCreateForm() {
  const router = useRouter();
  const t = useTranslations('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', logo_url: '' });

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const created = await createGroup({
        name: form.name,
        slug: form.slug,
        logo_url: form.logo_url.trim() || null,
      });
      router.push(`/admin/groups/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('groupFormError'));
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2.5 p-3 bg-destructive/8 border border-destructive/20 text-destructive rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          {t('groupFormNameLabel')}
        </Label>
        <Input
          id="name"
          type="text"
          value={form.name}
          onChange={(e) =>
            setForm({ ...form, name: e.target.value, slug: generateSlug(e.target.value) })
          }
          placeholder={t('groupFormNamePlaceholder')}
          className="h-11"
          required
          minLength={2}
          maxLength={255}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug" className="text-sm font-medium flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          {t('groupFormSlugLabel')}
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            /admin/groups/
          </span>
          <Input
            id="slug"
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            pattern="^[a-z0-9-]+$"
            placeholder={t('groupFormSlugPlaceholder')}
            className="h-11 pl-28 font-mono text-sm"
            required
            minLength={2}
            maxLength={100}
          />
        </div>
        <p className="text-[13px] text-muted-foreground">{t('groupFormSlugHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="logo_url" className="text-sm font-medium flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
          {t('groupFormLogoLabel')}
        </Label>
        <Input
          id="logo_url"
          type="url"
          value={form.logo_url}
          onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          placeholder={t('groupFormLogoPlaceholder')}
          className="h-11"
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full h-11 gap-2">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('groupFormCreating')}
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            {t('groupFormCreateCta')}
          </>
        )}
      </Button>
    </form>
  );
}
