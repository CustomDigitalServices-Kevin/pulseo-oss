/**
 * Processor Solution/Package Dataverse (P8).
 *
 * Input : fichier ZIP d'export Solution Dataverse. Structure typique :
 *   - solution.xml : métadonnées (Name, Version, Publisher)
 *   - customizations.xml : composants (entities, workflows, webresources, etc.)
 *   - [Content_Types].xml : metadata (ignoré)
 *   - Entities/, WebResources/, Workflows/ : fichiers internes (ignorés)
 *
 * Output : manifest arborescent groupé par component_type.
 * ```
 * {
 *   solutionName: "MySolution",
 *   version: "1.0.0.0",
 *   publisher: "MyOrg",
 *   groups: [
 *     { type: "Entity", items: [{ id, name, displayName }] },
 *     { type: "Workflow", items: [...] },
 *     { type: "WebResource", items: [...] },
 *   ]
 * }
 * ```
 */
import { XMLParser } from 'fast-xml-parser';
import { safeUnzip } from '@/modules/projects/lib/safe-unzip';

export interface SolutionComponent {
  id: string;
  name: string;
  displayName?: string;
}

export interface SolutionGroup {
  type: string; // "Entity", "Workflow", "WebResource", "Role", "Plugin"
  items: SolutionComponent[];
}

export interface SolutionManifest {
  version: 1;
  solutionName: string;
  solutionVersion: string;
  publisher: string;
  groups: SolutionGroup[];
  metadata: {
    totalComponents: number;
    parseWarnings: string[];
  };
}

export class SolutionParseError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'SolutionParseError';
  }
}

export async function isLikelySolutionZip(
  zipPath: string,
  zipSizeBytes: number,
): Promise<boolean> {
  try {
    const entries = await safeUnzip(zipPath, { zipSizeBytes, entriesLimit: 500 });
    return entries.some((e) => e.path === 'solution.xml' || e.path === 'customizations.xml');
  } catch {
    return false;
  }
}

export async function processSolutionZip(opts: {
  zipPath: string;
  zipSizeBytes: number;
}): Promise<SolutionManifest> {
  const entries = await safeUnzip(opts.zipPath, {
    zipSizeBytes: opts.zipSizeBytes,
    entriesLimit: 20000,
  });

  const solutionEntry = entries.find((e) => e.path === 'solution.xml');
  const customizationsEntry = entries.find((e) => e.path === 'customizations.xml');
  if (!solutionEntry && !customizationsEntry) {
    throw new SolutionParseError(
      'no_solution_files',
      'Aucun solution.xml ou customizations.xml trouvé — pas un export Dataverse',
    );
  }

  const warnings: string[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
  });

  // ── solution.xml : metadata
  let solutionName = 'Solution';
  let solutionVersion = '0.0.0.0';
  let publisher = '';
  if (solutionEntry) {
    try {
      const doc = parser.parse(solutionEntry.content.toString('utf8'));
      // Structure typique : ImportExportXml > SolutionManifest > UniqueName / Version / Publisher > UniqueName
      const mani = doc?.ImportExportXml?.SolutionManifest ?? doc?.SolutionManifest ?? null;
      if (mani) {
        solutionName = asStr(mani.UniqueName ?? mani.LocalizedNames?.LocalizedName?.[0] ?? mani.DisplayName) || solutionName;
        solutionVersion = asStr(mani.Version) || solutionVersion;
        const pub = mani.Publisher;
        if (pub) {
          publisher = asStr(pub.UniqueName) || asStr(pub.LocalizedNames?.LocalizedName?.[0]) || '';
        }
      }
    } catch (err) {
      warnings.push(`solution.xml parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── customizations.xml : composants
  const groups: Map<string, SolutionComponent[]> = new Map();
  if (customizationsEntry) {
    try {
      const doc = parser.parse(customizationsEntry.content.toString('utf8'));
      const root = doc?.ImportExportXml ?? doc;

      // Entities
      const entities = ensureArray(root?.Entities?.Entity);
      for (const e of entities) {
        addComponent(groups, 'Entity', {
          id: asStr(e.MetadataId) || asStr(e.Name?.['@_LocalizedName']) || asStr(e.Name) || 'unknown',
          name: asStr(e.Name?.['@_OriginalName']) || asStr(e.Name) || 'unknown',
          displayName: asStr(e.EntityInfo?.entity?.['@_Name']) || asStr(e.EntityInfo?.entity?.LocalizedNames?.LocalizedName?.[0]?.['@_description']),
        });
      }

      // Workflows
      const workflows = ensureArray(root?.Workflows?.Workflow);
      for (const w of workflows) {
        addComponent(groups, 'Workflow', {
          id: asStr(w['@_WorkflowId']) || asStr(w['@_Id']) || 'unknown',
          name: asStr(w['@_Name']) || asStr(w.Name) || 'unknown',
          displayName: asStr(w['@_Subject']),
        });
      }

      // WebResources
      const webresources = ensureArray(root?.WebResources?.WebResource);
      for (const wr of webresources) {
        addComponent(groups, 'WebResource', {
          id: asStr(wr.WebResourceId) || asStr(wr['@_Name']) || 'unknown',
          name: asStr(wr.Name) || 'unknown',
          displayName: asStr(wr.DisplayName),
        });
      }

      // Roles
      const roles = ensureArray(root?.Roles?.Role);
      for (const r of roles) {
        addComponent(groups, 'Role', {
          id: asStr(r['@_id']) || asStr(r.RoleId) || 'unknown',
          name: asStr(r['@_name']) || asStr(r.Name) || 'unknown',
        });
      }

      // SDKMessageProcessingSteps (plugins)
      const plugins = ensureArray(
        root?.SdkMessageProcessingSteps?.SdkMessageProcessingStep ?? root?.PluginAssemblies?.PluginAssembly,
      );
      for (const p of plugins) {
        addComponent(groups, 'Plugin', {
          id: asStr(p['@_PluginTypeId']) || asStr(p['@_Id']) || 'unknown',
          name: asStr(p['@_Name']) || asStr(p.Name) || 'unknown',
        });
      }
    } catch (err) {
      warnings.push(`customizations.xml parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const groupArr: SolutionGroup[] = Array.from(groups.entries())
    .map(([type, items]) => ({ type, items }))
    .sort((a, b) => a.type.localeCompare(b.type));

  const totalComponents = groupArr.reduce((n, g) => n + g.items.length, 0);

  return {
    version: 1,
    solutionName,
    solutionVersion,
    publisher,
    groups: groupArr,
    metadata: { totalComponents, parseWarnings: warnings },
  };
}

function addComponent(groups: Map<string, SolutionComponent[]>, type: string, comp: SolutionComponent) {
  if (!groups.has(type)) groups.set(type, []);
  groups.get(type)!.push(comp);
}

function asStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

function ensureArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
