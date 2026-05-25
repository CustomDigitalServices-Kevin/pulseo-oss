import { cn } from '@/lib/utils';

export type LogoBackground = 'auto' | 'light' | 'dark' | 'transparent';
export type LogoShape = 'square' | 'rect';
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<LogoSize, number> = {
  sm: 32,
  md: 44,
  lg: 80,
  xl: 128,
};

const RADIUS: Record<LogoSize, string> = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  xl: 'rounded-2xl',
};

// Mapping de la taille DB (sm/md/lg) vers la taille interne OrgLogo. Les
// valeurs DB sont volontairement plus grandes que leurs homonymes internes
// car le user attend un logo "moyen" plus visible qu'une icône compacte.
const DB_SIZE_TO_INTERNAL: Record<'sm' | 'md' | 'lg', LogoSize> = {
  sm: 'md',
  md: 'lg',
  lg: 'xl',
};

export function dbSizeToInternal(dbSize: 'sm' | 'md' | 'lg' | null | undefined): LogoSize {
  if (!dbSize) return 'lg';
  return DB_SIZE_TO_INTERNAL[dbSize];
}

// Ratio largeur/hauteur pour le shape rect (paysage). 3:1 cible bien les
// logos corporate horizontaux sans étirer les marques carrées qui restent
// en square.
const RECT_RATIO = 3;

export interface OrgLogoProps {
  name: string;
  logoUrl: string | null;
  background: LogoBackground;
  shape?: LogoShape;
  size?: LogoSize;
  fallbackColor?: string | null;
  className?: string;
}

/**
 * Affiche le logo client en respectant le fond + la forme + la taille.
 * Si pas de logo, retombe sur l'initiale + couleur primaire (dans le même
 * cadre shape/size pour rester cohérent au remplacement).
 *
 * Background mapping :
 *  - transparent : pas de fond, le logo "flotte" sur le parent
 *  - light       : fond blanc + padding intérieur (logos clairs sur fond sombre)
 *  - dark        : fond zinc-900 + padding (logos sombres sur fond clair)
 *  - auto        : retombe sur 'light' côté UI car la résolution effective
 *                  s'écrit en DB au moment de l'upload (PNG/JPEG/WebP) ou est
 *                  déjà 'light' par fallback (SVG)
 *
 * Shape mapping :
 *  - square : width = height = SIZE_PX[size]
 *  - rect   : height = SIZE_PX[size], width = height * RECT_RATIO (3:1)
 */
export function OrgLogo({
  name,
  logoUrl,
  background,
  shape = 'square',
  size = 'md',
  fallbackColor,
  className,
}: OrgLogoProps) {
  const heightPx = SIZE_PX[size];
  const widthPx = shape === 'rect' ? heightPx * RECT_RATIO : heightPx;
  const radius = RADIUS[size];

  if (!logoUrl) {
    const initial = name.trim().charAt(0).toUpperCase() || '?';
    const bgColor = fallbackColor ?? '#2563EB';
    return (
      <div
        aria-hidden="true"
        className={cn('flex items-center justify-center text-white font-bold border', radius, className)}
        style={{
          width: widthPx,
          height: heightPx,
          backgroundColor: bgColor,
          borderColor: 'color-mix(in oklch, currentColor 30%, transparent)',
          fontSize: Math.round(heightPx * 0.42),
        }}
      >
        {initial}
      </div>
    );
  }

  const resolved: Exclude<LogoBackground, 'auto'> = background === 'auto' ? 'light' : background;

  const wrapperStyle: React.CSSProperties = (() => {
    if (resolved === 'transparent') return {};
    if (resolved === 'light') return { backgroundColor: '#ffffff' };
    return { backgroundColor: '#0a0a0a' };
  })();

  const padding = resolved === 'transparent' ? 0 : Math.max(2, Math.round(heightPx * 0.1));

  return (
    <div
      className={cn('flex items-center justify-center border overflow-hidden', radius, className)}
      style={{
        width: widthPx,
        height: heightPx,
        padding,
        borderColor:
          resolved === 'transparent'
            ? 'color-mix(in oklch, currentColor 18%, transparent)'
            : 'color-mix(in oklch, currentColor 12%, transparent)',
        ...wrapperStyle,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={`Logo ${name}`}
        width={widthPx - padding * 2}
        height={heightPx - padding * 2}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}
