'use client';

import { useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { X, Tag as TagIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Tag input — type a tag and press Enter to add. Click X to remove.
 *
 * Tags are normalized: lowercased, trimmed, no spaces (replaced by -).
 * Duplicates are silently rejected.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  maxTags = 10,
  disabled = false,
  className,
}: TagInputProps) {
  const t = useTranslations('ticket');
  const resolvedPlaceholder = placeholder ?? t('tagPlaceholder');
  const [input, setInput] = useState('');

  const normalize = (raw: string): string =>
    raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);

  const addTag = () => {
    const tag = normalize(input);
    if (!tag) return;
    if (value.includes(tag)) {
      setInput('');
      return;
    }
    if (value.length >= maxTags) return;
    onChange([...value, tag]);
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 px-3 py-2 min-h-11 border rounded-lg bg-background focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-ring/60 transition',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      <TagIcon className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-md border border-primary/20"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:text-destructive transition-colors"
            aria-label={t('tagRemoveAria', { tag })}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={value.length === 0 ? resolvedPlaceholder : ''}
        disabled={disabled || value.length >= maxTags}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
      />
      {value.length >= maxTags && (
        <span className="text-[12px] text-muted-foreground">
          {t('tagMax', { max: maxTags })}
        </span>
      )}
    </div>
  );
}
