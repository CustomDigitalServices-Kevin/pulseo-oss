import sharp from 'sharp';

export type LogoBackground = 'auto' | 'light' | 'dark' | 'transparent';

const BORDER_PX = 4;
const LIGHT_THRESHOLD = 128;

/**
 * Convertit une bordure RGB(A) raw en luminance moyenne perçue (Rec. 709).
 * Les pixels totalement transparents (alpha=0) sont ignorés pour ne pas
 * tirer la moyenne vers 0 sur les logos avec fond transparent.
 *
 * Format attendu : Buffer aligné [R, G, B, A?] répété, channels = 3 ou 4.
 */
export function meanLuminance(buffer: Buffer, channels: 3 | 4): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < buffer.length; i += channels) {
    const r = buffer[i] ?? 0;
    const g = buffer[i + 1] ?? 0;
    const b = buffer[i + 2] ?? 0;
    const a = channels === 4 ? (buffer[i + 3] ?? 255) : 255;
    if (a === 0) continue;
    // Rec. 709 luma — proche de la perception humaine
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    count += 1;
  }
  if (count === 0) return 255; // 100% transparent → considère comme "light"
  return sum / count;
}

/**
 * Décide quel fond appliquer derrière un bitmap (PNG/JPEG/WebP) en analysant
 * la luminance moyenne d'une bordure périphérique de BORDER_PX. Un fond
 * sombre -> on rend `dark` (fond noir + padding); fond clair -> `light`.
 *
 * Pour SVG : on ne peut pas extraire de pixels sans rasteriser à une taille
 * arbitraire, ce qui n'est pas représentatif. La fonction retourne donc
 * 'light' en fallback. Le sélecteur 4-options dans le formulaire
 * d'édition permet la correction manuelle.
 */
export async function detectLogoBackground(
  buffer: Buffer,
  mime: string,
): Promise<Exclude<LogoBackground, 'auto'>> {
  if (mime === 'image/svg+xml') return 'light';

  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return 'light';

  const w = meta.width;
  const h = meta.height;
  const border = Math.max(1, Math.min(BORDER_PX, Math.floor(Math.min(w, h) / 4)));
  const channels = (meta.channels === 4 ? 4 : 3) as 3 | 4;

  // Extraction des 4 bordures séparément. Chaque sharp() doit recharger le
  // buffer car .extract() consomme l'instance.
  const top = await sharp(buffer)
    .extract({ left: 0, top: 0, width: w, height: border })
    .raw()
    .toBuffer();
  const bottom = await sharp(buffer)
    .extract({ left: 0, top: h - border, width: w, height: border })
    .raw()
    .toBuffer();
  const left = await sharp(buffer)
    .extract({ left: 0, top: 0, width: border, height: h })
    .raw()
    .toBuffer();
  const right = await sharp(buffer)
    .extract({ left: w - border, top: 0, width: border, height: h })
    .raw()
    .toBuffer();

  const all = Buffer.concat([top, bottom, left, right]);
  const luminance = meanLuminance(all, channels);
  return luminance < LIGHT_THRESHOLD ? 'dark' : 'light';
}
