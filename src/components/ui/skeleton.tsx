import { cn } from '@/lib/utils';

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Skeleton loading placeholder with the project's premium tinted shimmer.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted/60',
        className
      )}
      {...props}
    />
  );
}
