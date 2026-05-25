'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** Tint colour for the radial glow. Defaults to the primary brand colour. */
  tintVar?: string;
  /** Render the card as a Link or other element. Defaults to a div. */
  as?: 'div' | 'article' | 'section';
}

/**
 * Card with a Stripe-style cursor-following spotlight effect.
 *
 * Uses two CSS variables (--spotlight-x, --spotlight-y) updated on every
 * pointermove. The visual itself is rendered by the .spotlight class in
 * globals.css via a pseudo-element so we don't pay for an extra DOM node.
 *
 * Performance: a single rAF-throttled update keeps the cost negligible
 * even with dozens of cards in the viewport.
 */
export function SpotlightCard({
  children,
  className,
  tintVar,
  as: Tag = 'div',
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node) return;
    const x = e.clientX;
    const y = e.clientY;

    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const rect = node.getBoundingClientRect();
      const px = ((x - rect.left) / rect.width) * 100;
      const py = ((y - rect.top) / rect.height) * 100;
      node.style.setProperty('--spotlight-x', `${px}%`);
      node.style.setProperty('--spotlight-y', `${py}%`);
    });
  };

  const style: CSSProperties = tintVar
    ? ({ '--tint': tintVar } as CSSProperties)
    : {};

  return (
    <Tag
      ref={ref as never}
      onPointerMove={handlePointerMove}
      style={style}
      className={cn('spotlight', className)}
    >
      {children}
    </Tag>
  );
}
