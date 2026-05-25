import { cn } from '@/lib/utils';

type LogoVariant = 'mark' | 'horizontal' | 'vertical';

interface LogoProps {
  variant?: LogoVariant;
  size?: number;
  markColor?: string;
  className?: string;
  ariaLabel?: string;
}

const MARK_COLOR = '#4F7FFF';

export function Logo({
  variant = 'mark',
  size,
  markColor = MARK_COLOR,
  className,
  ariaLabel = 'Pulseo',
}: LogoProps) {
  if (variant === 'mark') {
    const dim = size ?? 28;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        width={dim}
        height={dim}
        fill="none"
        className={className}
        role="img"
        aria-label={ariaLabel}
      >
        <g
          stroke={markColor}
          strokeWidth={44}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 140 96 L 140 416" />
          <path d="M 140 96 L 268 96 A 92 92 0 0 1 268 280 L 140 280" />
          <path
            d="M 56 188 L 168 188 L 196 150 L 224 226 L 252 188 L 360 188"
            strokeWidth={36}
          />
        </g>
      </svg>
    );
  }

  if (variant === 'horizontal') {
    const w = size ?? 160;
    const h = w / 4;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1024 256"
        width={w}
        height={h}
        fill="none"
        className={cn('text-foreground', className)}
        role="img"
        aria-label={ariaLabel}
      >
        <g
          transform="translate(28 28) scale(0.39)"
          stroke={markColor}
          strokeWidth={44}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 140 96 L 140 416" />
          <path d="M 140 96 L 268 96 A 92 92 0 0 1 268 280 L 140 280" />
          <path
            d="M 56 188 L 168 188 L 196 150 L 224 226 L 252 188 L 360 188"
            strokeWidth={36}
          />
        </g>
        <text
          x="240"
          y="158"
          fontFamily="Inter, 'Inter Display', system-ui, sans-serif"
          fontSize={132}
          fontWeight={600}
          letterSpacing={-1.32}
          fill="currentColor"
        >
          Pulseo
        </text>
      </svg>
    );
  }

  const w = size ?? 200;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={w}
      height={w}
      fill="none"
      className={cn('text-foreground', className)}
      role="img"
      aria-label={ariaLabel}
    >
      <g
        transform="translate(272 240) scale(0.94)"
        stroke={markColor}
        strokeWidth={44}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 140 96 L 140 416" />
        <path d="M 140 96 L 268 96 A 92 92 0 0 1 268 280 L 140 280" />
        <path
          d="M 56 188 L 168 188 L 196 150 L 224 226 L 252 188 L 360 188"
          strokeWidth={36}
        />
      </g>
      <text
        x="512"
        y="868"
        textAnchor="middle"
        fontFamily="Inter, 'Inter Display', system-ui, sans-serif"
        fontSize={160}
        fontWeight={600}
        letterSpacing={-1.6}
        fill="currentColor"
      >
        Pulseo
      </text>
    </svg>
  );
}
