'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createComment } from '@/actions/comments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Lock, AlertCircle } from 'lucide-react';

interface CommentFormProps {
  ticketId: string;
}

export function CommentForm({ ticketId }: CommentFormProps) {
  const router = useRouter();
  const t = useTranslations('ticket');
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await createComment({
      ticket_id: ticketId,
      content,
      is_internal: isInternal,
    });

    if (result.success) {
      setContent('');
      setIsInternal(false);
      router.refresh();
    } else {
      setError(result.error || t('genericError'));
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/8 border border-destructive/20 text-destructive rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('commentPlaceholder')}
        rows={3}
        className="resize-none leading-relaxed"
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer group">
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            isInternal ? 'bg-[oklch(0.795_0.155_80)] border-amber-500' : 'border-border group-hover:border-muted-foreground'
          }`}>
            {isInternal && <Lock className="w-2.5 h-2.5 text-white" />}
          </div>
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="sr-only"
          />
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            {t('commentInternal')}
          </span>
        </label>

        <Button
          type="submit"
          size="sm"
          disabled={loading || !content.trim()}
          className="gap-1.5 h-8"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {t('commentSubmit')}
        </Button>
      </div>
    </form>
  );
}
