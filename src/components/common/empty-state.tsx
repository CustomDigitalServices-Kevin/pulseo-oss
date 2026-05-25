import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

/**
 * Premium empty state — large icon, centered title and description, optional CTA.
 * Use this to replace placeholder "Aucun X" texts everywhere.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const cta = action ? (
    action.href ? (
      <Link href={action.href}>
        <Button variant="cta" size="lg" className="gap-2">
          {action.label}
        </Button>
      </Link>
    ) : (
      <Button variant="cta" size="lg" onClick={action.onClick} className="gap-2">
        {action.label}
      </Button>
    )
  ) : null;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-6 animate-in',
        className
      )}
    >
      <div className="relative mb-5">
        {/* Soft halo behind the icon */}
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-xl" />
        <div className="relative w-14 h-14 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center">
          <Icon className="w-7 h-7 text-muted-foreground/70" strokeWidth={1.5} />
        </div>
      </div>
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
          {description}
        </p>
      )}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
