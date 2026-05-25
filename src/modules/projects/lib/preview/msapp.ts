/**
 * Processor MSAPP (Power Apps canvas app) — P6.
 *
 * Input : fichier .msapp (ZIP) contenant :
 *   - CanvasManifest.json : métadonnées (nom app, version, date)
 *   - Src/*.pa.yaml ou Src/Screens/*.pa.yaml : screens en Power Fx YAML
 *   - Assets/, References/, DataSources/, etc. (ignorés par ce processor)
 *
 * Output : manifest SVG wireframe avec positions contrôles.
 * ```
 * {
 *   appName: "MyApp",
 *   screens: [
 *     {
 *       id: "Screen1",
 *       name: "Screen1",
 *       controls: [
 *         { id: "Button1", type: "Button", x: 50, y: 100, w: 200, h: 40 },
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * Limitations MVP :
 * - Valeurs Power Fx dynamiques (formules `=If(...)`, `=App.Width * 0.5`) ignorées
 *   si pas un nombre constant → contrôle skipé ou positionné à 0/0
 * - Children nested (galleries, groups) : extraits mais sans respect hiérarchie
 *   (tous flats au niveau screen)
 * - Formes/styles (couleurs, fonts) non extraits — juste rectangle par type
 */
import yaml from 'yaml';
import { safeUnzip } from '@/modules/projects/lib/safe-unzip';

export interface MsappControl {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MsappScreen {
  id: string;
  name: string;
  controls: MsappControl[];
}

export interface MsappManifest {
  version: 1;
  appName: string;
  screens: MsappScreen[];
  metadata: {
    screenCount: number;
    controlCount: number;
    parseWarnings: string[];
  };
}

export class MsappParseError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'MsappParseError';
  }
}

export async function isLikelyMsappZip(zipPath: string, zipSizeBytes: number): Promise<boolean> {
  try {
    const entries = await safeUnzip(zipPath, { zipSizeBytes, entriesLimit: 2000 });
    return entries.some(
      (e) => e.path === 'CanvasManifest.json' || /\.pa\.yaml$/i.test(e.path),
    );
  } catch {
    return false;
  }
}

export async function processMsappZip(opts: {
  zipPath: string;
  zipSizeBytes: number;
}): Promise<MsappManifest> {
  const entries = await safeUnzip(opts.zipPath, {
    zipSizeBytes: opts.zipSizeBytes,
    // Increased entries limit : un MSAPP a facilement 2-3k assets
    entriesLimit: 10000,
  });

  // Metadata
  const manifestEntry = entries.find((e) => e.path === 'CanvasManifest.json');
  let appName = 'Power Apps';
  if (manifestEntry) {
    try {
      const raw = JSON.parse(manifestEntry.content.toString('utf8'));
      if (typeof raw?.AppName === 'string') appName = raw.AppName;
      else if (typeof raw?.Name === 'string') appName = raw.Name;
    } catch {
      // skip — appName reste default
    }
  }

  // Screens : fichiers .pa.yaml sous Src/
  const screenEntries = entries.filter(
    (e) => /\.pa\.yaml$/i.test(e.path) && /^Src\//i.test(e.path),
  );
  if (screenEntries.length === 0) {
    throw new MsappParseError('no_screens', 'Aucun fichier .pa.yaml trouvé sous Src/');
  }

  const warnings: string[] = [];
  const screens: MsappScreen[] = [];

  for (const entry of screenEntries) {
    const parsed = parseScreenYaml(entry.content.toString('utf8'), entry.path, warnings);
    if (parsed) screens.push(parsed);
  }

  const controlCount = screens.reduce((n, s) => n + s.controls.length, 0);

  return {
    version: 1,
    appName,
    screens,
    metadata: {
      screenCount: screens.length,
      controlCount,
      parseWarnings: warnings,
    },
  };
}

/**
 * Parse un .pa.yaml screen. Tolérant aux variations Power Apps Studio :
 * - `ScreenName:\n  Properties:\n    ...\n  Children:\n    - ControlName As ControlType:`
 * - Ou `ScreenName As screen:` en préfixe
 *
 * Extrait les contrôles et leurs X/Y/Width/Height (valeurs numériques
 * constantes uniquement).
 */
function parseScreenYaml(
  yamlContent: string,
  filePath: string,
  warnings: string[],
): MsappScreen | null {
  let doc: unknown;
  try {
    doc = yaml.parse(yamlContent);
  } catch (err) {
    warnings.push(`YAML parse error in ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  if (!doc || typeof doc !== 'object') {
    warnings.push(`Empty or non-object YAML in ${filePath}`);
    return null;
  }

  // La racine est un mapping { "ScreenName As screen": {...} } ou { "ScreenName": {...} }
  const rootKeys = Object.keys(doc as Record<string, unknown>);
  if (rootKeys.length === 0) {
    warnings.push(`No root key in ${filePath}`);
    return null;
  }

  const rawKey = rootKeys[0];
  const { name: screenName } = parseKeyWithType(rawKey);

  const rootValue = (doc as Record<string, unknown>)[rawKey];
  const children = extractChildren(rootValue);

  const controls: MsappControl[] = [];
  walkChildren(children, controls, warnings, filePath);

  return {
    id: screenName || path.basename(filePath).replace(/\.pa\.yaml$/i, ''),
    name: screenName || path.basename(filePath).replace(/\.pa\.yaml$/i, ''),
    controls,
  };
}

function parseKeyWithType(key: string): { name: string; type: string | null } {
  // Format "ControlName As ControlType" ou juste "ControlName"
  const m = key.match(/^(.+?)\s+As\s+([\w.]+)\s*$/i);
  if (m) return { name: m[1].trim(), type: m[2].trim() };
  return { name: key.trim(), type: null };
}

function extractChildren(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return [];
  const v = value as Record<string, unknown>;
  const children = v.Children;
  if (Array.isArray(children)) return children.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object');
  return [];
}

function walkChildren(
  children: Array<Record<string, unknown>>,
  out: MsappControl[],
  warnings: string[],
  filePath: string,
): void {
  for (const child of children) {
    // Un enfant = mapping à 1 clé "Name As Type"
    const childKeys = Object.keys(child);
    if (childKeys.length === 0) continue;
    const rawKey = childKeys[0];
    const { name, type } = parseKeyWithType(rawKey);
    if (!type) {
      warnings.push(`${filePath}: control '${name}' without 'As <Type>' — skipping`);
      continue;
    }

    const body = child[rawKey];
    const props = extractProperties(body);
    const x = readNumber(props?.X);
    const y = readNumber(props?.Y);
    const w = readNumber(props?.Width);
    const h = readNumber(props?.Height);

    out.push({
      id: name,
      type,
      x: x ?? 0,
      y: y ?? 0,
      w: w ?? 100,
      h: h ?? 40,
    });

    // Récursion sur les Children du contrôle (galleries, groups)
    const nestedChildren = extractChildren(body);
    if (nestedChildren.length > 0) {
      walkChildren(nestedChildren, out, warnings, filePath);
    }
  }
}

function extractProperties(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const p = (value as Record<string, unknown>).Properties;
  if (p && typeof p === 'object') return p as Record<string, unknown>;
  return null;
}

/**
 * Les valeurs Power Fx sont préfixées `=` puis suivies d'une formule.
 * On accepte uniquement les constantes numériques `=50` ou `=50.5`.
 * Les formules dynamiques (`=App.Width * 0.5`) retournent null.
 */
function readNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const stripped = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

// Simple path helper utilisé localement (évite import node:path pour consommation client side)
const path = {
  basename(p: string): string {
    const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return i >= 0 ? p.slice(i + 1) : p;
  },
};
