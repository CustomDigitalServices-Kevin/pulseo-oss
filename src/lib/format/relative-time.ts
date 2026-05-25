/**
 * Tiny French relative-time formatter.
 *
 * No external dep (neither dayjs nor date-fns are installed). Produces
 * human-readable strings like "il y a 5 min" / "il y a 2 h" / "il y a 3 j".
 *
 * Thresholds are coarse by design: the UI shows activity feeds where the
 * exact minute rarely matters. For values past 30 days we fall back to a
 * `DD/MM/YYYY` date to avoid awkward "il y a 57 j" strings.
 *
 * Apostrophes are emitted as Unicode U+2019 so React renders them safely
 * as plain text.
 */

const RSQUO = '\u2019';

export function formatRelativeFr(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const now = Date.now();
  const diffMs = now - d.getTime();

  // Future dates — treat as "à l'instant" rather than showing negatives.
  if (diffMs < 0) return `à l${RSQUO}instant`;

  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return `à l${RSQUO}instant`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;

  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;

  const days = Math.floor(h / 24);
  if (days < 30) return `il y a ${days} j`;

  // Past 30 days — show a short date. `fr-FR` gives DD/MM/YYYY.
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
