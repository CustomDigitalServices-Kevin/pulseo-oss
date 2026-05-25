/**
 * Bloc "Projets" affiché sur la page dashboard organisation.
 *
 * Server Component async — monté via le shim privé
 * `src/app/(portal)/clients/[slug]/projects/_overview-block.tsx`
 * (préfixe `_` → ignoré par le Next router, dossier `projects/` → matché
 * par l'exception ESLint `no-restricted-imports`).
 *
 * Gating effectif appliqué par l'appelant (isGestionnaire && projectsEnabled).
 * Defense-in-depth : l'action elle-même retourne `null` si flag off /
 * unauthenticated / forbidden — on re-vérifie ici via le type union.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/common/spotlight-card';
import {
  FolderKanban,
  Package,
  CheckCircle2,
  ArrowRight,
  Plus,
  FileText,
  ListChecks,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getOrgProjectsOverview } from '@/modules/projects/actions/org-overview';

// ─── Mapping statut projet → style badge (enum PROJECT_STATUSES) ──────────────

const PROJECT_STATUS_STYLES: Record<string, string> = {
  chiffrage: 'bg-canvas text-foreground-muted border-border',
  en_cours: 'bg-primary/12 text-primary border-primary/30',
  en_attente: 'bg-[oklch(0.795_0.155_80)]/12 text-[oklch(0.795_0.155_80)] border-[oklch(0.795_0.155_80)]/30',
  recette: 'bg-[oklch(0.680_0.180_310)]/12 text-[oklch(0.680_0.180_310)] border-[oklch(0.680_0.180_310)]/30',
  valide: 'bg-[oklch(0.700_0.165_155)]/12 text-[oklch(0.700_0.165_155)] border-[oklch(0.700_0.165_155)]/30',
  archive: 'bg-canvas text-foreground-subtle border-border',
};

// ─── KPI Card locale (réplique le style des KPIs page org) ────────────────────

type KpiCardProps = {
  label: string;
  value: string | number;
  sub: string;
  icon: LucideIcon;
  tintColor: string;
  href: string;
};

function KpiCard({ label, value, sub, icon: Icon, tintColor, href }: KpiCardProps) {
  return (
    <Link href={href} className="block">
      <SpotlightCard
        tintVar={tintColor}
        className="glow-border group relative overflow-hidden rounded-xl bg-elevated border border-border min-h-[108px] cursor-pointer"
      >
        <div
          aria-hidden
          className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-40 transition-opacity duration-500 group-hover:opacity-80"
          style={{ background: `radial-gradient(circle, ${tintColor} 0%, transparent 65%)` }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, color-mix(in oklch, ${tintColor} 35%, transparent), transparent)`,
          }}
        />
        <div className="relative p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] truncate" style={{ color: 'var(--foreground-subtle)' }}>
              {label}
            </p>
            <div
              className="relative w-7 h-7 rounded-md flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: `color-mix(in oklch, ${tintColor} 14%, transparent)`,
                borderColor: `color-mix(in oklch, ${tintColor} 28%, transparent)`,
                boxShadow: `0 0 16px -4px color-mix(in oklch, ${tintColor} 55%, transparent)`,
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: tintColor }} strokeWidth={2.25} />
            </div>
          </div>
          <p className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums leading-none text-foreground">
            {value}
          </p>
          <p className="text-[13px] mt-1.5 truncate" style={{ color: 'var(--foreground-subtle)' }}>
            {sub}
          </p>
        </div>
      </SpotlightCard>
    </Link>
  );
}

// ─── ProjectRow (réplique le row "derniers tickets") ──────────────────────────

type ProjectRowProps = {
  slug: string;
  project: {
    id: string;
    name: string;
    status: string;
    docsCount: number;
    deliverablesCount: number;
    testsPassed: number;
    testsTotal: number;
  };
  statusLabels: Record<string, string>;
  tooltipLabels: { docs: string; deliv: string; tests: string };
};

function ProjectRow({ slug, project, statusLabels, tooltipLabels }: ProjectRowProps) {
  const statusClass = PROJECT_STATUS_STYLES[project.status] ?? 'bg-canvas text-foreground-muted';
  const statusLabel = statusLabels[project.status] ?? project.status;
  const testsLabel = project.testsTotal === 0 ? '—' : `${project.testsPassed}/${project.testsTotal}`;

  return (
    <Link
      href={`/clients/${slug}/projects/${project.id}`}
      className="list-item-premium group flex items-center justify-between p-3 border border-border rounded-md"
    >
      <div className="flex items-center gap-3 min-w-0">
        <FolderKanban className="w-3.5 h-3.5 text-foreground-subtle shrink-0" strokeWidth={2} />
        <span className="font-medium text-[15px] truncate">{project.name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Badge
          variant="outline"
          className={`h-5 text-[12px] px-1.5 font-medium ${statusClass}`}
        >
          {statusLabel}
        </Badge>
        <div className="flex items-center gap-2.5 text-[13px] text-foreground-subtle tabular-nums">
          <span className="flex items-center gap-1" title={tooltipLabels.docs}>
            <FileText className="w-3 h-3" /> {project.docsCount}
          </span>
          <span className="flex items-center gap-1" title={tooltipLabels.deliv}>
            <Package className="w-3 h-3" /> {project.deliverablesCount}
          </span>
          <span className="flex items-center gap-1" title={tooltipLabels.tests}>
            <ListChecks className="w-3 h-3" /> {testsLabel}
          </span>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-foreground-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

type Props = { orgId: string; slug: string };

export async function ProjectsOverviewBlock({ orgId, slug }: Props) {
  const data = await getOrgProjectsOverview(orgId);
  if (!data) return null;

  const tOverview = await getTranslations('projects.overview');
  const tStatus = await getTranslations('projects.status');

  const statusLabels: Record<string, string> = {
    chiffrage: tStatus('chiffrage'),
    en_cours: tStatus('en_cours'),
    en_attente: tStatus('en_attente'),
    recette: tStatus('recette'),
    valide: tStatus('valide'),
    archive: tStatus('archive'),
  };
  const tooltipLabels = {
    docs: tOverview('docsTooltip'),
    deliv: tOverview('delivTooltip'),
    tests: tOverview('testsTooltip'),
  };

  return (
    <>
      {/* KPIs projets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label={tOverview('activeProjectsLabel')}
          value={data.kpis.activeCount}
          sub={tOverview('activeSub')}
          icon={FolderKanban}
          tintColor="oklch(0.625 0.205 264)"
          href={`/clients/${slug}/projects`}
        />
        <KpiCard
          label={tOverview('activeDeliverables')}
          value={data.kpis.latestDeliverables}
          sub={tOverview('activeDeliverablesSub')}
          icon={Package}
          tintColor="oklch(0.700 0.165 155)"
          href={`/clients/${slug}/projects`}
        />
        <KpiCard
          label={tOverview('recipePercentLabel')}
          value={data.kpis.recipePercent !== null ? `${data.kpis.recipePercent}%` : '—'}
          sub={tOverview('recipePercentSub')}
          icon={CheckCircle2}
          tintColor="oklch(0.795 0.155 80)"
          href={`/clients/${slug}/projects`}
        />
      </div>

      {/* Liste top 3 projets récents */}
      <Card className="border border-border bg-elevated shadow-premium-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
              <FolderKanban className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-[15px] font-semibold">{tOverview('recentProjects')}</CardTitle>
          </div>
          <Link href={`/clients/${slug}/projects`}>
            <Button variant="ghost" size="sm" className="text-[13px] text-foreground-muted hover:text-foreground gap-1 h-7">
              {tOverview('seeAll')} <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="pt-3">
          {data.recentProjects.length === 0 ? (
            <div className="text-center py-10">
              <div className="relative w-12 h-12 mx-auto mb-3">
                <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-xl" />
                <div className="relative w-12 h-12 rounded-2xl bg-elevated border border-border flex items-center justify-center">
                  <FolderKanban className="w-5 h-5 text-foreground-subtle" strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-[15px] text-foreground-muted">{tOverview('emptyOrg')}</p>
              <Link href={`/clients/${slug}/projects/new`}>
                <Button size="sm" className="mt-4 h-8 text-xs gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  {tOverview('createCta')}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5 animate-in-stagger">
              {data.recentProjects.map((p) => (
                <ProjectRow key={p.id} slug={slug} project={p} statusLabels={statusLabels} tooltipLabels={tooltipLabels} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default ProjectsOverviewBlock;
