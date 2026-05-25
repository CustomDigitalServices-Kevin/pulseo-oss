/**
 * Processor Power Automate flow (P5).
 *
 * Input : fichier ZIP d'export Power Automate (.zip contenant `definition.json`
 * ou structure Solution avec `workflow.json` dedans).
 * Output : manifest JSON simplifié `{ nodes, edges, metadata }` consommable par
 * React Flow dans `FlowDiagramViewer`.
 *
 * Format Power Automate export (simplified) :
 * ```
 * {
 *   "definition": {
 *     "triggers": { "When_*": { "type": "...", "inputs": {...} } },
 *     "actions": {
 *       "Action_Name": {
 *         "type": "Http"|"Compose"|"Condition"|"ApiConnection"|...,
 *         "inputs": {...},
 *         "runAfter": { "Previous_Action": ["Succeeded"] }
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * Chaque trigger + action devient un node. Les edges sont déduits des
 * `runAfter` (clé = source, value = target). Les triggers sont les noeuds
 * racine (pas de runAfter).
 */
import { safeUnzip } from '@/modules/projects/lib/safe-unzip';

export interface FlowNode {
  id: string;
  label: string;
  type: string;
  kind: 'trigger' | 'action';
  description?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  statuses?: string[]; // runAfter values : Succeeded / Failed / Skipped / TimedOut
}

export interface FlowManifest {
  version: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
  metadata: {
    triggerCount: number;
    actionCount: number;
    parseWarnings: string[];
  };
}

/**
 * Parse un ZIP Power Automate et retourne le manifest de preview.
 *
 * Throw `FlowParseError` avec code lisible si structure inattendue.
 */
export class FlowParseError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'FlowParseError';
  }
}

/**
 * Heuristique : le ZIP est-il probablement un Power Automate flow ?
 * Utilisé avant enqueue pour éviter de lancer le worker sur tous les ZIP.
 */
export async function isLikelyFlowZip(zipPath: string, zipSizeBytes: number): Promise<boolean> {
  try {
    const entries = await safeUnzip(zipPath, { zipSizeBytes, entriesLimit: 500 });
    return entries.some(
      (e) => e.path === 'definition.json' || /workflow\.json$/i.test(e.path),
    );
  } catch {
    return false;
  }
}

export async function processFlowZip(opts: {
  zipPath: string;
  zipSizeBytes: number;
}): Promise<FlowManifest> {
  const entries = await safeUnzip(opts.zipPath, {
    zipSizeBytes: opts.zipSizeBytes,
  });

  // Préférence : definition.json à la racine. Fallback : n'importe quel workflow.json.
  let definitionBuf = entries.find((e) => e.path === 'definition.json')?.content;
  if (!definitionBuf) {
    definitionBuf = entries.find((e) => /workflow\.json$/i.test(e.path))?.content;
  }
  if (!definitionBuf) {
    throw new FlowParseError(
      'no_definition',
      'Aucun definition.json ou workflow.json trouvé dans le ZIP',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(definitionBuf.toString('utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new FlowParseError('invalid_json', `JSON mal formé: ${msg}`);
  }

  return buildManifest(parsed);
}

/**
 * Extrait nodes + edges du JSON Power Automate.
 * Tolérant aux variations de structure (definition peut être à la racine ou
 * sous `.properties.definition`).
 */
export function buildManifest(raw: unknown): FlowManifest {
  const warnings: string[] = [];
  const definition = locateDefinition(raw);
  if (!definition) {
    throw new FlowParseError('no_definition_key', 'Clé `definition` introuvable');
  }

  const triggers = safeRecord(definition.triggers);
  const actions = safeRecord(definition.actions);

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  for (const [name, trig] of Object.entries(triggers)) {
    const t = safeObject(trig);
    nodes.push({
      id: name,
      label: name.replace(/_/g, ' '),
      type: typeof t.type === 'string' ? t.type : 'unknown',
      kind: 'trigger',
      description: typeof t.description === 'string' ? t.description : undefined,
    });
  }

  for (const [name, act] of Object.entries(actions)) {
    const a = safeObject(act);
    nodes.push({
      id: name,
      label: name.replace(/_/g, ' '),
      type: typeof a.type === 'string' ? a.type : 'unknown',
      kind: 'action',
      description: typeof a.description === 'string' ? a.description : undefined,
    });

    const runAfter = safeRecord(a.runAfter);
    if (Object.keys(runAfter).length === 0) {
      // Action racine (après trigger) — edge depuis chaque trigger
      for (const trigName of Object.keys(triggers)) {
        edges.push({
          id: `e_${trigName}_${name}`,
          source: trigName,
          target: name,
        });
      }
    } else {
      for (const [src, statuses] of Object.entries(runAfter)) {
        edges.push({
          id: `e_${src}_${name}`,
          source: src,
          target: name,
          statuses: Array.isArray(statuses)
            ? statuses.filter((s): s is string => typeof s === 'string')
            : undefined,
        });
      }
    }
  }

  if (nodes.length === 0) {
    warnings.push('Aucun noeud extrait — structure inconnue');
  }

  return {
    version: 1,
    nodes,
    edges,
    metadata: {
      triggerCount: Object.keys(triggers).length,
      actionCount: Object.keys(actions).length,
      parseWarnings: warnings,
    },
  };
}

function locateDefinition(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.definition && typeof r.definition === 'object') {
    return r.definition as Record<string, unknown>;
  }
  // Power Automate v2 packaging : { properties: { definition: {...} } }
  if (r.properties && typeof r.properties === 'object') {
    const p = r.properties as Record<string, unknown>;
    if (p.definition && typeof p.definition === 'object') {
      return p.definition as Record<string, unknown>;
    }
  }
  // Racine direct : triggers/actions
  if (r.triggers || r.actions) return r;
  return null;
}

function safeRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function safeObject(v: unknown): Record<string, unknown> {
  return safeRecord(v);
}
