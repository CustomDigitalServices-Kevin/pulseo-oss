'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { useTranslations } from 'next-intl';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: number;
  invalid?: boolean;
  /** Aria-describedby pour error/hint externe (react-hook-form). */
  ariaDescribedBy?: string;
}

/**
 * Éditeur texte enrichi WYSIWYG basé sur TipTap 3.x. Entrée / sortie = Markdown
 * (via `tiptap-markdown`) pour conserver la compatibilité avec les tickets
 * existants stockés en Markdown dans `tickets.description`.
 *
 * Toolbar : gras / italique / barré / h2 / h3 / listes / citation / code inline
 * + undo / redo. Pas de tables ni d'images — scope volontairement réduit pour
 * éviter la complexité inutile côté utilisateur client final.
 *
 * SSR : `immediatelyRender: false` requis pour Next.js (évite hydration
 * mismatch). Source : https://tiptap.dev/docs/editor/getting-started/install/nextjs
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 200,
  invalid = false,
  ariaDescribedBy,
}: RichTextEditorProps) {
  const t = useTranslations('common2');
  const resolvedPlaceholder = placeholder ?? t('richEditorPlaceholder');
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Pas de horizontalRule ni table — hors scope ticket support
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      // `storage.markdown.getMarkdown()` est fourni par tiptap-markdown
      const md = (
        editor.storage as { markdown?: { getMarkdown: () => string } }
      ).markdown?.getMarkdown();
      onChange(md ?? '');
    },
    editorProps: {
      attributes: {
        'aria-describedby': ariaDescribedBy ?? '',
        class: cn(
          'prose prose-sm prose-invert max-w-none',
          'min-h-[var(--rte-min-h)] p-4 text-[15px] leading-relaxed text-foreground/90',
          'focus:outline-none',
          // Styling listes + blockquotes + code depuis prose-invert suffit
        ),
      },
    },
  });

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-lg border bg-canvas transition-colors',
          invalid ? 'border-destructive/50' : 'border-border',
        )}
        style={{ minHeight: minHeight + 48 }}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-canvas overflow-hidden transition-colors',
        invalid
          ? 'border-destructive/50 focus-within:border-destructive/70'
          : 'border-border focus-within:border-primary/50',
      )}
    >
      <Toolbar editor={editor} />
      <div
        style={{ ['--rte-min-h' as string]: `${minHeight}px` }}
        className="relative"
      >
        {!editor.getText() && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-4 left-4 text-[15px] text-foreground-subtle/70 select-none"
          >
            {resolvedPlaceholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations('common2');
  const btnBase =
    'inline-flex items-center justify-center w-8 h-8 rounded-md text-foreground-muted hover:bg-elevated hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none';
  const active = 'bg-primary/15 text-primary ring-1 ring-primary/30';

  return (
    <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-border bg-elevated/40 backdrop-blur-sm">
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('bold') && active)}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title={t('richEditorBold')}
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('italic') && active)}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t('richEditorItalic')}
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('strike') && active)}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title={t('richEditorStrike')}
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('heading', { level: 2 }) && active)}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title={t('richEditorHeading')}
      >
        <Heading2 className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('heading', { level: 3 }) && active)}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title={t('richEditorSubheading')}
      >
        <Heading3 className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('bulletList') && active)}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title={t('richEditorBulletList')}
      >
        <List className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('orderedList') && active)}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title={t('richEditorOrderedList')}
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('blockquote') && active)}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title={t('richEditorQuote')}
      >
        <Quote className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        className={cn(btnBase, editor.isActive('code') && active)}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title={t('richEditorCode')}
      >
        <Code className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <div className="flex-1" />
      <ToolbarBtn
        className={btnBase}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={t('richEditorUndo')}
      >
        <Undo2 className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        className={btnBase}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={t('richEditorRedo')}
      >
        <Redo2 className="w-3.5 h-3.5" />
      </ToolbarBtn>
    </div>
  );
}

function ToolbarBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="w-px h-4 bg-border mx-1" />;
}
