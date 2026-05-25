'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  addOrgResponsible,
  removeOrgResponsible,
} from '@/actions/org-responsibles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, Mail, Plus, Trash2, User } from 'lucide-react';

export interface Responsible {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

interface Props {
  organizationId: string;
  initial: Responsible[];
}

export function ResponsiblesManager({ organizationId, initial }: Props) {
  const t = useTranslations('admin');
  const [rows, setRows] = useState<Responsible[]>(initial);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const result = await addOrgResponsible({
        organization_id: organizationId,
        email: trimmed,
        name: name.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRows((prev) => [
        ...prev,
        {
          id: result.data.id,
          email: trimmed,
          name: name.trim() || null,
          created_at: new Date().toISOString(),
        },
      ]);
      setEmail('');
      setName('');
    });
  };

  const handleRemove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await removeOrgResponsible(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    });
  };

  return (
    <div className="space-y-5">
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-6 px-4 text-center">
          <p className="text-[15px] text-foreground-muted">{t('responsiblesEmpty')}</p>
          <p className="text-[13px] text-foreground-subtle mt-1">
            {t('responsiblesEmptyHint')}
          </p>
        </div>
      ) : (
        <ul className="divide-y border border-border rounded-md overflow-hidden">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-4 px-3.5 py-2.5 bg-canvas"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-[13px] font-semibold text-primary">
                  {(r.name ?? r.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium truncate">
                    {r.name ?? r.email}
                  </p>
                  {r.name && (
                    <p className="text-[13px] text-foreground-subtle font-mono truncate">
                      {r.email}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleRemove(r.id)}
                disabled={isPending}
                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('responsiblesDelete')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-3 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="resp-name" className="text-[13px] font-medium text-foreground-muted flex items-center gap-1.5">
              <User className="w-3 h-3" />
              {t('responsiblesNameLabel')}
            </Label>
            <Input
              id="resp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('responsiblesNamePlaceholder')}
              className="h-10"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resp-email" className="text-[13px] font-medium text-foreground-muted flex items-center gap-1.5">
              <Mail className="w-3 h-3" />
              {t('responsiblesEmailLabel')}
            </Label>
            <Input
              id="resp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('responsiblesEmailPlaceholder')}
              className="h-10"
              required
              disabled={isPending}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={isPending || !email.trim()}
              className="h-10 gap-1.5"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {t('responsiblesAdd')}
            </Button>
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-destructive/8 border border-destructive/20 text-destructive text-[14px]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}
