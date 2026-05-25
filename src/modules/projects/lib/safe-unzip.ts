/**
 * Safe ZIP extraction helper — anti zip-slip + anti zip-bomb.
 *
 * Spec §"Sécurité uploads C3 Zip-slip & extraction bombs" :
 *  - Helper unique utilisé par TOUS les processors futurs (MSAPP P6, PBIX P7,
 *    Solution P8, Flow P5)
 *  - Rejet entry si path normalisé contient `..`, commence par `/`, contient `\`
 *  - Cap taille totale décompressée : **10× taille compressée max** (anti bomb)
 *  - Cap nombre d'entries : **50 000 max**
 *  - Cap taille per-entry décompressée : **100 MB**
 *  - Timeout extraction : 60s (kill au-delà)
 *  - Validation via `yauzl` (streaming, pas `adm-zip` CVE zip-slip)
 *
 * Utilisation :
 *   const entries = await safeUnzip(zipPath, { ratioLimit: 10 });
 *   for (const entry of entries) {
 *     console.log(entry.path, entry.size, entry.content);
 *   }
 *
 * Retourne une liste d'entries en mémoire (pas d'extraction disque) — OK pour
 * XML/JSON/Layout qui font <100MB chacun. Aucun streaming pour le moment :
 * les processors actuels chargent l'intégralité du ZIP en RAM avant traitement.
 */
import yauzl from 'yauzl';
import path from 'path';

export interface SafeUnzipEntry {
  path: string;
  size: number;
  content: Buffer;
}

export interface SafeUnzipOptions {
  /** Ratio max taille décompressée / taille ZIP (default 10). */
  ratioLimit?: number;
  /** Max entries (default 50_000). */
  entriesLimit?: number;
  /** Max taille per-entry (default 100MB). */
  perEntryLimit?: number;
  /** Timeout extraction ms (default 60_000). */
  timeoutMs?: number;
  /** Taille ZIP en bytes — utilisée pour calculer le cap décompressé. */
  zipSizeBytes: number;
}

export class UnsafeZipError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'UnsafeZipError';
  }
}

const DEFAULT_RATIO_LIMIT = 10;
const DEFAULT_ENTRIES_LIMIT = 50_000;
const DEFAULT_PER_ENTRY_LIMIT = 100 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Valide un path d'entrée ZIP contre zip-slip + segments dangereux.
 * Retourne le path normalisé ou null si invalide.
 */
export function normalizeEntryPath(raw: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('/') || raw.startsWith('\\')) return null;
  if (raw.includes('\\')) return null; // Windows-style path interdits dans ZIP
  // Normalise et vérifie qu'il ne sort pas de la racine virtuelle
  const normalized = path.posix.normalize(raw);
  if (normalized.startsWith('..') || normalized.includes('/..') || normalized === '..') {
    return null;
  }
  if (path.posix.isAbsolute(normalized)) return null;
  return normalized;
}

/**
 * Extrait toutes les entries du ZIP en mémoire avec les guards zip-slip +
 * zip-bomb. Throw `UnsafeZipError` avec code explicite sur violation.
 *
 * Codes :
 *   - `zip_slip` : path contient `..` ou `/` ou `\`
 *   - `too_many_entries` : > entriesLimit
 *   - `entry_too_large` : une entry dépasse perEntryLimit
 *   - `ratio_exceeded` : taille décompressée totale > zipSize × ratioLimit
 *   - `timeout` : extraction > timeoutMs
 *   - `invalid_zip` : ZIP corrompu
 */
export async function safeUnzip(
  zipPath: string,
  options: SafeUnzipOptions,
): Promise<SafeUnzipEntry[]> {
  const ratioLimit = options.ratioLimit ?? DEFAULT_RATIO_LIMIT;
  const entriesLimit = options.entriesLimit ?? DEFAULT_ENTRIES_LIMIT;
  const perEntryLimit = options.perEntryLimit ?? DEFAULT_PER_ENTRY_LIMIT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const totalLimit = options.zipSizeBytes * ratioLimit;

  return new Promise<SafeUnzipEntry[]>((resolve, reject) => {
    const entries: SafeUnzipEntry[] = [];
    let totalUncompressed = 0;
    let entryCount = 0;
    let settled = false;
    const settle = (err?: Error, result?: SafeUnzipEntry[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (err) reject(err);
      else resolve(result ?? []);
    };

    const timeoutHandle = setTimeout(
      () => settle(new UnsafeZipError('timeout', 'ZIP extraction timeout')),
      timeoutMs,
    );

    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) return settle(new UnsafeZipError('invalid_zip', err.message));

      // yauzl émet ses propres erreurs sur paths dangereux — on les re-categorise
      // comme zip_slip pour cohérence avec nos codes d'erreur publics.
      const classifyYauzlError = (e: Error): UnsafeZipError => {
        const m = e.message;
        if (/invalid relative path|absolute path|contains backslash/i.test(m)) {
          return new UnsafeZipError('zip_slip', m);
        }
        return new UnsafeZipError('invalid_zip', m);
      };

      zipfile.on('error', (e) => settle(classifyYauzlError(e)));

      zipfile.on('entry', (entry) => {
        entryCount++;
        if (entryCount > entriesLimit) {
          return settle(
            new UnsafeZipError('too_many_entries', `> ${entriesLimit} entries`),
          );
        }

        // Skip les directories (fileName finit par /)
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        const safePath = normalizeEntryPath(entry.fileName);
        if (!safePath) {
          return settle(
            new UnsafeZipError('zip_slip', `unsafe path: ${entry.fileName}`),
          );
        }

        if (entry.uncompressedSize > perEntryLimit) {
          return settle(
            new UnsafeZipError(
              'entry_too_large',
              `entry ${safePath} = ${entry.uncompressedSize}B > ${perEntryLimit}B`,
            ),
          );
        }

        // Verify cap avant de streamer
        if (totalUncompressed + entry.uncompressedSize > totalLimit) {
          return settle(
            new UnsafeZipError(
              'ratio_exceeded',
              `uncompressed > ${ratioLimit}× zip size`,
            ),
          );
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) {
            return settle(new UnsafeZipError('invalid_zip', streamErr.message));
          }
          const chunks: Buffer[] = [];
          let entryBytes = 0;
          stream.on('data', (chunk: Buffer) => {
            entryBytes += chunk.length;
            if (entryBytes > perEntryLimit) {
              stream.destroy();
              return settle(
                new UnsafeZipError('entry_too_large', `entry ${safePath} streaming overflow`),
              );
            }
            chunks.push(chunk);
          });
          stream.once('end', () => {
            totalUncompressed += entryBytes;
            if (totalUncompressed > totalLimit) {
              return settle(
                new UnsafeZipError('ratio_exceeded', 'uncompressed exceeded ratio cap'),
              );
            }
            entries.push({
              path: safePath,
              size: entryBytes,
              content: Buffer.concat(chunks),
            });
            zipfile.readEntry();
          });
          stream.once('error', (e) =>
            settle(new UnsafeZipError('invalid_zip', e.message)),
          );
        });
      });

      zipfile.on('end', () => settle(undefined, entries));

      zipfile.readEntry();
    });
  });
}
