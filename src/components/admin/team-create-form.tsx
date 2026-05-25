'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createTeam } from '@/actions/teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Loader2, Send, Users2, Globe, FileText } from 'lucide-react';

export function TeamCreateForm() {
  const router = useRouter();
  const t = useTranslations('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '' });

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
      const created = await createTeam({
        name: form.name,
        slug: form.slug,
        description: form.description.trim() || null,
      });
      router.push(`/admin/teams/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamFormError'));
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
          <Users2 className="w-3.5 h-3.5 text-muted-foreground" />
          {t('teamFormNameLabel')}
        </Label>
        <Input
          id="name"
          type="text"
          value={form.name}
          onChange={(e) =>
            setForm({ ...form, name: e.target.value, slug: generateSlug(e.target.value) })
          }
          placeholder={t('teamFormNamePlaceholder')}
          className="h-11"
          required
          minLength={2}
          maxLength={255}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug" className="text-sm font-medium flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          {t('teamFormSlugLabel')}
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            /admin/teams/
          </span>
          <Input
            id="slug"
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            pattern="^[a-z0-9-]+$"
            placeholder={t('teamFormSlugPlaceholder')}
            className="h-11 pl-24 font-mono text-sm"
            required
            minLength={2}
            maxLength={100}
          />
        </div>
        <p className="text-[13px] text-muted-foreground">{t('teamFormSlugHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm font-medium flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          {t('teamFormDescLabel')}
        </Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={t('teamFormDescPlaceholder')}
          rows={3}
          className="resize-none leading-relaxed"
          maxLength={1000}
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full h-11 gap-2">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('teamFormCreating')}
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            {t('teamFormCreateCta')}
          </>
        )}
      </Button>
    </form>
  );
}
