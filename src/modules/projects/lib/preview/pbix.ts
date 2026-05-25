/**
 * Processor PBIX Power BI (P7).
 *
 * Input : fichier .pbix (ZIP) contenant :
 *   - Report/Layout : JSON encodé UTF-16LE (pas UTF-8!) avec structure sections+visuals
 *   - DataModel : modèle tabulaire binaire (ignoré MVP)
 *   - DiagramLayout, Metadata, etc. (ignorés)
 *
 * Output : manifest wireframe avec sections (pages) + visuals (charts/tables/cards).
 * ```
 * {
 *   version: 1,
 *   pages: [
 *     { id, name, displayName, width, height,
 *       visuals: [{ id, type, x, y, w, h, title? }] }
 *   ]
 * }
 * ```
 *
 * Limitations MVP :
 * - Données des visuals non extraites — juste position + type
 * - Filtres, slicers complexes, thèmes non rendus
 * - Version Power BI Desktop récente uniquement (schema Layout ~JSON-stringify)
 */
import iconv from 'iconv-lite';
import { safeUnzip } from '@/modules/projects/lib/safe-unzip';

export interface PbixVisual {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
}

export interface PbixPage {
  id: string;
  name: string;
  displayName: string;
  width: number;
  height: number;
  visuals: PbixVisual[];
}

export interface PbixManifest {
  version: 1;
  pages: PbixPage[];
  metadata: {
    pageCount: number;
    visualCount: number;
    parseWarnings: string[];
  };
}

export class PbixParseError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PbixParseError';
  }
}

export async function isLikelyPbixZip(zipPath: string, zipSizeBytes: number): Promise<boolean> {
  try {
    const entries = await safeUnzip(zipPath, { zipSizeBytes, entriesLimit: 500 });
    return entries.some((e) => e.path === 'Report/Layout' || e.path === 'DataModel');
  } catch {
    return false;
  }
}

export async function processPbixZip(opts: {
  zipPath: string;
  zipSizeBytes: number;
}): Promise<PbixManifest> {
  const entries = await safeUnzip(opts.zipPath, {
    zipSizeBytes: opts.zipSizeBytes,
    entriesLimit: 5000,
    // Layout JSON peut être gros (plusieurs MB sur un rapport complet)
    perEntryLimit: 100 * 1024 * 1024,
  });

  const layoutEntry = entries.find((e) => e.path === 'Report/Layout');
  if (!layoutEntry) {
    throw new PbixParseError('no_layout', 'Fichier Report/Layout absent');
  }

  // Layout est UTF-16LE avec BOM optional — iconv-lite decode
  const rawString = iconv.decode(layoutEntry.content, 'utf-16le').replace(/^\uFEFF/, '');

  let layout: unknown;
  try {
    layout = JSON.parse(rawString);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PbixParseError('invalid_layout_json', `Layout JSON parse failed: ${msg}`);
  }

  return buildPbixManifest(layout);
}

export function buildPbixManifest(raw: unknown): PbixManifest {
  const warnings: string[] = [];
  const root = raw as Record<string, unknown>;

  // `sections` (Power BI Desktop) ou `pods` (variant) selon version
  const sections = Array.isArray(root?.sections) ? root.sections : [];
  if (sections.length === 0) {
    warnings.push('Aucune section trouvée dans Layout (Power BI Desktop récent attendu)');
  }

  const pages: PbixPage[] = [];
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    const section = s as Record<string, unknown>;
    const pageId = asStr(section.name) || asStr(section.displayName) || `page_${pages.length}`;
    const visualContainers = Array.isArray(section.visualContainers) ? section.visualContainers : [];

    const visuals: PbixVisual[] = [];
    for (const vcRaw of visualContainers) {
      if (!vcRaw || typeof vcRaw !== 'object') continue;
      const vc = vcRaw as Record<string, unknown>;
      const config = parseEmbeddedJson(vc.config);
      const visualType = asStr(
        (config?.singleVisual as Record<string, unknown> | undefined)?.visualType,
      ) || 'unknown';
      const title = extractVisualTitle(config);
      visuals.push({
        id: asStr(vc.id) || asStr(config?.name) || `visual_${visuals.length}`,
        type: visualType,
        x: asNum(vc.x) ?? 0,
        y: asNum(vc.y) ?? 0,
        w: asNum(vc.width) ?? 200,
        h: asNum(vc.height) ?? 150,
        title,
      });
    }

    pages.push({
      id: pageId,
      name: pageId,
      displayName: asStr(section.displayName) || pageId,
      width: asNum(section.width) ?? 1280,
      height: asNum(section.height) ?? 720,
      visuals,
    });
  }

  const visualCount = pages.reduce((n, p) => n + p.visuals.length, 0);
  return {
    version: 1,
    pages,
    metadata: {
      pageCount: pages.length,
      visualCount,
      parseWarnings: warnings,
    },
  };
}

function parseEmbeddedJson(v: unknown): Record<string, unknown> | null {
  if (typeof v !== 'string') return null;
  try {
    const p = JSON.parse(v);
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractVisualTitle(config: Record<string, unknown> | null): string | undefined {
  if (!config) return undefined;
  const sv = config.singleVisual as Record<string, unknown> | undefined;
  const vt = (sv?.vcObjects as Record<string, unknown> | undefined)?.title;
  if (!Array.isArray(vt) || vt.length === 0) return undefined;
  const first = vt[0] as Record<string, unknown>;
  const props = first?.properties as Record<string, unknown> | undefined;
  const text = props?.text as Record<string, unknown> | undefined;
  const expr = text?.expr as Record<string, unknown> | undefined;
  const literal = expr?.Literal as Record<string, unknown> | undefined;
  if (typeof literal?.Value === 'string') {
    // Power BI wraps strings in single quotes
    return literal.Value.replace(/^'|'$/g, '');
  }
  return undefined;
}

function asStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
