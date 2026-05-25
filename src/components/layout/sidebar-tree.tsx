"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderKanban,
  Layers,
  LayoutDashboard,
  Menu,
  MessageSquarePlus,
  Search,
  Shield,
  Ticket,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { Logo } from "@/components/common/logo";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * Sidebar arborescente à 3 niveaux (flag ENABLE_GROUPS_AND_TEAMS = true).
 *
 * N1 = Sections (Administration / Groupes / Équipes / Autonomes)
 * N2 = Entités (Console admin / un groupe / une équipe / une org)
 * N3 = Sous-pages de l'entité active, rendues INLINE sous le N2 actif.
 *
 * Persistance de l'état expand/collapse dans un cookie `pulseo_sidebar`
 * (90 jours, SameSite=Lax, non HttpOnly). Auto-expand du noeud parent de
 * l'URL active au montage + scroll-into-view du lien actif.
 */

export type SidebarOrgRole = "admin" | "gestionnaire" | "viewer";

export interface SidebarOrgNode {
  id: string;
  slug: string;
  name: string;
  role: SidebarOrgRole;
}

export interface SidebarGroupNode {
  id: string;
  slug: string;
  name: string;
  orgs: SidebarOrgNode[];
}

export interface SidebarTeamNode {
  id: string;
  slug: string;
  name: string;
  orgs: SidebarOrgNode[];
}

export interface SidebarTreeProps {
  user: { id: string; isSuperadmin: boolean };
  groups: SidebarGroupNode[];
  teams: SidebarTeamNode[];
  autonomousOrgs: SidebarOrgNode[];
  defaultCollapsed: Record<string, boolean>;
  /**
   * Feature flag `ENABLE_PROJECTS_MODULE` évalué server-side dans le layout RSC.
   * Obligatoire de passer en prop : `process.env` côté browser renvoie undefined
   * pour les flags non préfixés `NEXT_PUBLIC_*`.
   */
  projectsEnabled?: boolean;
}

const ROLE_WEIGHT: Record<SidebarOrgRole, number> = {
  viewer: 1,
  gestionnaire: 2,
  admin: 3,
};

/**
 * Hierarchie admin > gestionnaire > viewer. Un org peut apparaître dans
 * plusieurs sources (autonomous + team + group) ; on prend le rôle le plus
 * fort pour gater l'accès côté UI.
 */
function maxRole(a: SidebarOrgRole, b: SidebarOrgRole): SidebarOrgRole {
  return ROLE_WEIGHT[a] >= ROLE_WEIGHT[b] ? a : b;
}

const ProjectsMenuItem = dynamic(
  () =>
    import("@/modules/projects").then((m) => ({ default: m.ProjectsMenuItem })),
  { ssr: false, loading: () => null },
);

const ROLE_LABELS: Record<SidebarOrgRole, string> = {
  admin: "admin",
  gestionnaire: "gest.",
  viewer: "view",
};

const COOKIE_MAX_AGE_DAYS = 90;

// ─── N3 helpers ──────────────────────────────────────────────────────────────

type N3Item = {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  tourId?: string;
};

function getOrgN3(
  slug: string,
  t: (key: string) => string,
  opts?: {
    canSeeMembers?: boolean;
    canSeeDocuments?: boolean;
    canSeeContracts?: boolean;
  },
): N3Item[] {
  // Les viewers ne voient que dashboard + tickets dans leur sidebar org.
  // Documents, contrats et membres sont réservés aux gestionnaire+/superadmin
  // (cohérent avec le backend : documents/page.tsx ligne 58 retourne notFound
  // si role < gestionnaire ; contracts/page.tsx ligne 65 redirige vers
  // /tickets ; members nécessite déjà canSeeMembers). Sans ce gating sidebar,
  // un viewer voyait les liens, cliquait, et tombait sur 404 / redirect =
  // mauvaise UX. Le backend reste l'autorité finale (defense in depth).
  const items: N3Item[] = [
    {
      href: `/clients/${slug}`,
      label: t("dashboard"),
      icon: <LayoutDashboard className="w-3.5 h-3.5" />,
      exact: true,
    },
    {
      href: `/clients/${slug}/tickets`,
      label: t("tickets"),
      icon: <Ticket className="w-3.5 h-3.5" />,
      tourId: "sidebar-tickets",
    },
  ];
  if (opts?.canSeeDocuments) {
    items.push({
      href: `/clients/${slug}/documents`,
      label: t("documents"),
      icon: <FileText className="w-3.5 h-3.5" />,
    });
  }
  if (opts?.canSeeContracts) {
    items.push({
      href: `/clients/${slug}/contracts`,
      label: t("contracts"),
      icon: <FolderKanban className="w-3.5 h-3.5" />,
    });
  }
  if (opts?.canSeeMembers) {
    items.push({
      href: `/clients/${slug}/members`,
      label: t("members"),
      icon: <Users className="w-3.5 h-3.5" />,
    });
  }
  return items;
}

function getGroupN3(slug: string, t: (key: string) => string): N3Item[] {
  return [
    {
      href: `/groups/${slug}/dashboard`,
      label: t("dashboard"),
      icon: <LayoutDashboard className="w-3.5 h-3.5" />,
      exact: true,
    },
    {
      href: `/groups/${slug}/organizations`,
      label: t("organizations"),
      icon: <Building2 className="w-3.5 h-3.5" />,
    },
    {
      href: `/groups/${slug}/members`,
      label: t("members"),
      icon: <Users className="w-3.5 h-3.5" />,
    },
  ];
}

function getAdminN3(t: (key: string) => string): N3Item[] {
  return [
    {
      href: "/admin/dashboard",
      label: t("dashboard"),
      icon: <LayoutDashboard className="w-3.5 h-3.5" />,
      exact: true,
    },
    {
      href: "/admin/clients",
      label: t("organizations"),
      icon: <Building2 className="w-3.5 h-3.5" />,
    },
    {
      href: "/admin/groups",
      label: t("groups"),
      icon: <Layers className="w-3.5 h-3.5" />,
    },
    {
      href: "/admin/teams",
      label: t("teams"),
      icon: <Users className="w-3.5 h-3.5" />,
    },
    {
      href: "/admin/users",
      label: t("users"),
      icon: <UserCog className="w-3.5 h-3.5" />,
    },
    {
      href: "/admin/feedback",
      label: t("feedback"),
      icon: <MessageSquarePlus className="w-3.5 h-3.5" />,
    },
  ];
}

function isPathActive(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SidebarTree(props: SidebarTreeProps) {
  const pathname = usePathname() ?? "/";
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Lazy init : scanner groups/teams pour trouver le parent de l'org active
  // dans l'URL et l'ouvrir au premier rendu (sinon l'user arrive via URL
  // directe et l'arbre reste collapsed sur son contexte courant).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial = { ...props.defaultCollapsed };
    const orgMatch = pathname.match(/^\/clients\/([^/]+)/);
    if (orgMatch) {
      const activeSlug = orgMatch[1];
      for (const g of props.groups) {
        if (g.orgs.some((o) => o.slug === activeSlug)) {
          initial[`group:${g.id}`] = false;
        }
      }
      for (const t of props.teams) {
        if (t.orgs.some((o) => o.slug === activeSlug)) {
          initial[`team:${t.id}`] = false;
        }
      }
    }
    const groupMatch = pathname.match(/^\/groups\/([^/]+)/);
    if (groupMatch) {
      const slug = groupMatch[1];
      const g = props.groups.find((x) => x.slug === slug);
      if (g) initial[`group:${g.id}`] = false;
    }
    return initial;
  });

  // Scroll-into-view du lien actif au montage : si l'arbre est long, l'item
  // courant peut sortir du viewport sidebar (overflow-y-auto).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>(
      '[data-sidebar-tree] [aria-current="page"]',
    );
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  const toggle = useCallback((nodeId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [nodeId]: !prev[nodeId] };
      if (typeof document !== "undefined") {
        const maxAge = 60 * 60 * 24 * COOKIE_MAX_AGE_DAYS;
        document.cookie = `pulseo_sidebar=${encodeURIComponent(
          JSON.stringify(next),
        )}; max-age=${maxAge}; path=/; samesite=lax`;
      }
      return next;
    });
  }, []);

  const q = search.trim().toLowerCase();

  const filteredGroups = useMemo<SidebarGroupNode[]>(() => {
    if (q === "") return props.groups;
    return props.groups
      .map((g) => ({
        ...g,
        orgs: g.orgs.filter((o) => o.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.name.toLowerCase().includes(q) || g.orgs.length > 0);
  }, [q, props.groups]);

  const filteredTeams = useMemo<SidebarTeamNode[]>(() => {
    if (q === "") return props.teams;
    return props.teams
      .map((t) => ({
        ...t,
        orgs: t.orgs.filter((o) => o.name.toLowerCase().includes(q)),
      }))
      .filter((t) => t.name.toLowerCase().includes(q) || t.orgs.length > 0);
  }, [q, props.teams]);

  const filteredAutonomous = useMemo<SidebarOrgNode[]>(() => {
    if (q === "") return props.autonomousOrgs;
    return props.autonomousOrgs.filter((o) => o.name.toLowerCase().includes(q));
  }, [q, props.autonomousOrgs]);

  const currentContext = useMemo<CurrentContext>(() => {
    if (pathname.startsWith("/admin")) return { type: "admin" };
    const groupMatch = pathname.match(/^\/groups\/([^/]+)/);
    if (groupMatch) return { type: "group", slug: groupMatch[1] };
    const orgMatch = pathname.match(/^\/clients\/([^/]+)/);
    if (orgMatch) return { type: "org", slug: orgMatch[1] };
    return { type: null };
  }, [pathname]);

  /**
   * Résout le rôle effectif de l'org courante (max sur toutes ses apparitions
   * dans groups/teams/autonomousOrgs). Utilisé pour gater le lien "Projets" :
   * si role ∉ {admin, gestionnaire} et user non superadmin, on masque le lien
   * (sinon clic → 404 par `hasProjectsAccess`).
   */
  const currentOrgRole = useMemo<SidebarOrgRole | null>(() => {
    if (currentContext.type !== "org") return null;
    const slug = currentContext.slug;
    let found: SidebarOrgRole | null = null;
    const consider = (role: SidebarOrgRole) => {
      found = found == null ? role : maxRole(found, role);
    };
    for (const g of props.groups) {
      for (const o of g.orgs) if (o.slug === slug) consider(o.role);
    }
    for (const t of props.teams) {
      for (const o of t.orgs) if (o.slug === slug) consider(o.role);
    }
    for (const o of props.autonomousOrgs) {
      if (o.slug === slug) consider(o.role);
    }
    return found;
  }, [currentContext, props.groups, props.teams, props.autonomousOrgs]);

  const canSeeProjects =
    currentContext.type === "org" &&
    (props.projectsEnabled ?? false) &&
    (props.user.isSuperadmin ||
      currentOrgRole === "admin" ||
      currentOrgRole === "gestionnaire");

  const closeMobile = useCallback(() => setOpen(false), []);

  const adminActive = currentContext.type === "admin";

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 flex items-center justify-center rounded-md bg-elevated border border-border text-foreground shadow-premium-md"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        type="button"
      >
        {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      <aside
        data-sidebar-tree
        className={cn(
          "fixed left-0 top-0 h-screen w-[260px] bg-surface text-foreground border-r border-border flex flex-col transition-transform duration-300 ease-out md:relative md:translate-x-0 z-40",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo header */}
        <div className="px-5 h-14 flex items-center gap-2.5 border-b border-border relative shrink-0">
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent"
          />
          <div
            className="relative w-7 h-7 rounded-md flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.205 264) 100%, white 12%), oklch(0.625 0.205 264))",
              boxShadow:
                "0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 -1px 0 0 oklch(0 0 0 / 0.30) inset, 0 4px 12px -2px oklch(0.625 0.205 264 / 0.45), 0 0 0 1px oklch(0.625 0.205 264 / 0.50)",
            }}
          >
            <Logo
              variant="mark"
              size={18}
              markColor="#FAFAFA"
              className="relative z-10"
            />
            <div className="absolute inset-0 rounded-md ring-1 ring-inset ring-white/20" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">
            Pulseo
          </span>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-subtle pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="pl-8 h-8 text-[15px] bg-elevated/60"
            />
          </div>
        </div>

        {/* Navigation — unique zone scrollable, N1 / N2 / N3 inline */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
          {props.user.isSuperadmin && (
            <Section
              title={t("administration")}
              icon={<Shield className="w-3.5 h-3.5" />}
            >
              <NavLink
                href="/admin/dashboard"
                active={adminActive}
                onNavigate={closeMobile}
              >
                {t("console")}
              </NavLink>
              {adminActive && (
                <N3Block
                  items={getAdminN3(t)}
                  pathname={pathname}
                  onNavigate={closeMobile}
                  ariaLabel="Navigation Administration"
                />
              )}
            </Section>
          )}

          {filteredGroups.length > 0 && (
            <Section
              title={t("groups")}
              icon={<Layers className="w-3.5 h-3.5" />}
              count={filteredGroups.length}
            >
              {filteredGroups.map((g) => {
                const nodeId = `group:${g.id}`;
                const isCollapsed = collapsed[nodeId] ?? false;
                const isGroupActive =
                  currentContext.type === "group" &&
                  currentContext.slug === g.slug;
                return (
                  <ExpandableNode
                    key={g.id}
                    nodeId={nodeId}
                    collapsed={isCollapsed}
                    onToggle={toggle}
                    header={
                      <Link
                        href={`/groups/${g.slug}/dashboard`}
                        onClick={closeMobile}
                        className={cn(
                          "flex-1 truncate text-[15px] text-foreground-muted hover:text-foreground transition-colors",
                          isGroupActive && "text-foreground font-medium",
                        )}
                      >
                        {g.name}
                      </Link>
                    }
                  >
                    {isGroupActive && (
                      <N3Block
                        items={getGroupN3(g.slug, t)}
                        pathname={pathname}
                        onNavigate={closeMobile}
                        ariaLabel={`Navigation Groupe ${g.name}`}
                      />
                    )}
                    {g.orgs.length === 0 ? (
                      <p className="text-[13px] text-foreground-subtle px-2 py-1 italic">
                        Aucune organisation
                      </p>
                    ) : (
                      g.orgs.map((o) => (
                        <OrgLink
                          key={o.id}
                          org={o}
                          active={pathname.startsWith(`/clients/${o.slug}`)}
                          pathname={pathname}
                          onNavigate={closeMobile}
                          canSeeProjects={canSeeProjects}
                          projectsSlug={
                            currentContext.type === "org"
                              ? currentContext.slug
                              : null
                          }
                          isSuperadmin={props.user.isSuperadmin}
                        />
                      ))
                    )}
                  </ExpandableNode>
                );
              })}
            </Section>
          )}

          {filteredTeams.length > 0 && (
            <Section
              title={t("teams")}
              icon={<Users className="w-3.5 h-3.5" />}
              count={filteredTeams.length}
            >
              {filteredTeams.map((t) => {
                const nodeId = `team:${t.id}`;
                const isCollapsed = collapsed[nodeId] ?? false;
                return (
                  <ExpandableNode
                    key={t.id}
                    nodeId={nodeId}
                    collapsed={isCollapsed}
                    onToggle={toggle}
                    header={
                      <span className="flex-1 truncate text-[15px] text-foreground-muted">
                        {t.name}
                      </span>
                    }
                  >
                    {t.orgs.length === 0 ? (
                      <p className="text-[13px] text-foreground-subtle px-2 py-1 italic">
                        Aucune organisation accessible
                      </p>
                    ) : (
                      t.orgs.map((o) => (
                        <OrgLink
                          key={o.id}
                          org={o}
                          active={pathname.startsWith(`/clients/${o.slug}`)}
                          pathname={pathname}
                          onNavigate={closeMobile}
                          canSeeProjects={canSeeProjects}
                          projectsSlug={
                            currentContext.type === "org"
                              ? currentContext.slug
                              : null
                          }
                          isSuperadmin={props.user.isSuperadmin}
                        />
                      ))
                    )}
                  </ExpandableNode>
                );
              })}
            </Section>
          )}

          {filteredAutonomous.length > 0 && (
            <Section
              title={t("autonomous")}
              icon={<Building2 className="w-3.5 h-3.5" />}
              count={filteredAutonomous.length}
            >
              {filteredAutonomous.map((o) => (
                <OrgLink
                  key={o.id}
                  org={o}
                  active={pathname.startsWith(`/clients/${o.slug}`)}
                  pathname={pathname}
                  onNavigate={closeMobile}
                  canSeeProjects={canSeeProjects}
                  projectsSlug={
                    currentContext.type === "org" ? currentContext.slug : null
                  }
                  isSuperadmin={props.user.isSuperadmin}
                />
              ))}
            </Section>
          )}

          {q !== "" &&
            filteredGroups.length === 0 &&
            filteredTeams.length === 0 &&
            filteredAutonomous.length === 0 && (
              <p className="text-[14px] text-foreground-subtle px-2 py-4 text-center">
                Aucun résultat
              </p>
            )}
        </nav>

        {/* Footer — trigger feedback modal (améliorations & bugs) */}
        <div className="border-t border-border p-2 shrink-0">
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-foreground-muted hover:text-foreground hover:bg-elevated/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            aria-label={t("feedbackTrigger")}
          >
            <span className="shrink-0 w-6 h-6 rounded-md bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
              <MessageSquarePlus className="w-3.5 h-3.5 text-primary" />
            </span>
            <span className="flex-1 text-left truncate">
              {t("feedbackTrigger")}
            </span>
          </button>
        </div>
      </aside>

      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {/* Backdrop mobile */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-canvas/80 backdrop-blur-sm z-30"
          onClick={closeMobile}
          onKeyDown={(e) => e.key === "Escape" && closeMobile()}
          role="button"
          tabIndex={0}
          aria-label="Fermer le menu"
        />
      )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

type CurrentContext =
  | { type: "admin" }
  | { type: "group"; slug: string }
  | { type: "org"; slug: string }
  | { type: null };

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
        <span className="text-foreground-subtle">{icon}</span>
        <span className="flex-1">{title}</span>
        {typeof count === "number" && (
          <span className="tabular-nums opacity-70">{count}</span>
        )}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ExpandableNode({
  nodeId,
  collapsed,
  onToggle,
  header,
  children,
}: {
  nodeId: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const childArray = React.Children.toArray(children);
  return (
    <div>
      <div className="flex items-center gap-1 px-1 py-1 rounded-md hover:bg-elevated/50 transition-colors">
        <button
          type="button"
          onClick={() => onToggle(nodeId)}
          aria-label={collapsed ? "Développer" : "Réduire"}
          aria-expanded={!collapsed}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-elevated text-foreground-subtle hover:text-foreground transition-colors shrink-0"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
        {header}
      </div>
      {!collapsed && childArray.length > 0 && (
        <div className="ml-3 mt-0.5 pl-2 border-l border-border/60 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * OrgLink avec N3 inline rendus sous le lien lorsque l'org est active.
 * N3 org = Dashboard / Tickets / Documents / Contrats (+ Membres si admin/gestionnaire/superadmin) (+ Projets si gated).
 */
function OrgLink({
  org,
  active,
  pathname,
  onNavigate,
  canSeeProjects,
  projectsSlug,
  isSuperadmin,
}: {
  org: SidebarOrgNode;
  active: boolean;
  pathname: string;
  onNavigate?: () => void;
  canSeeProjects: boolean;
  projectsSlug: string | null;
  isSuperadmin: boolean;
}) {
  const t = useTranslations("nav");
  // Documents, contrats et membres = gestionnaire+/superadmin uniquement.
  // Le viewer ne doit pas voir ces liens dans la sidebar (le backend gate
  // déjà ces routes mais l'UX serait trompeuse de les afficher pour rien).
  const hasResponsibleAccess =
    isSuperadmin || org.role === "admin" || org.role === "gestionnaire";
  const canSeeMembers = hasResponsibleAccess;
  const canSeeDocuments = hasResponsibleAccess;
  const canSeeContracts = hasResponsibleAccess;
  return (
    <div>
      <Link
        href={`/clients/${org.slug}`}
        onClick={onNavigate}
        aria-current={
          active && pathname === `/clients/${org.slug}` ? "page" : undefined
        }
        className={cn(
          "flex items-center justify-between gap-2 py-1.5 rounded-md text-[15px] transition-colors border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          active
            ? "pl-[6px] pr-2 border-primary bg-elevated text-foreground font-medium"
            : "px-2 border-transparent text-foreground-muted hover:bg-elevated/60 hover:text-foreground",
        )}
      >
        <span className="truncate">{org.name}</span>
        <Badge variant="outline" className="shrink-0 h-4 px-1.5 text-[12px]">
          {ROLE_LABELS[org.role]}
        </Badge>
      </Link>
      {active && (
        <N3Block
          items={getOrgN3(org.slug, t, {
            canSeeMembers,
            canSeeDocuments,
            canSeeContracts,
          })}
          pathname={pathname}
          onNavigate={onNavigate}
          ariaLabel={`Navigation ${org.name}`}
        >
          {canSeeProjects && projectsSlug === org.slug && (
            <ProjectsMenuItem orgSlug={org.slug} />
          )}
        </N3Block>
      )}
    </div>
  );
}

function NavLink({
  href,
  active,
  onNavigate,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 py-1.5 rounded-md text-[15px] transition-colors border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        active
          ? "pl-[6px] pr-2 border-primary bg-elevated text-foreground font-medium"
          : "px-2 border-transparent text-foreground-muted hover:bg-elevated/60 hover:text-foreground",
      )}
    >
      {icon && <span className="shrink-0 text-foreground-subtle">{icon}</span>}
      <span className="truncate">{children}</span>
    </Link>
  );
}

/**
 * Bloc N3 rendu inline sous l'item N2 actif. Indentation progressive via
 * `ml-4 pl-2 border-l border-border/40` (second niveau, plus léger que le
 * `border-border/60` des children d'ExpandableNode pour distinguer N2 vs N3).
 */
function N3Block({
  items,
  pathname,
  onNavigate,
  ariaLabel,
  children,
}: {
  items: N3Item[];
  pathname: string;
  onNavigate?: () => void;
  ariaLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="navigation"
      aria-label={ariaLabel}
      className="ml-4 mt-0.5 pl-2 border-l border-border/40 space-y-0.5"
    >
      {items.map((item) => (
        <N3Link
          key={item.href}
          href={item.href}
          active={isPathActive(pathname, item.href, item.exact)}
          icon={item.icon}
          onNavigate={onNavigate}
          tourId={item.tourId}
        >
          {item.label}
        </N3Link>
      ))}
      {children}
    </div>
  );
}

function N3Link({
  href,
  active,
  icon,
  onNavigate,
  tourId,
  children,
}: {
  href: string;
  active: boolean;
  icon?: React.ReactNode;
  onNavigate?: () => void;
  tourId?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-tour-id={tourId}
      className={cn(
        "flex items-center gap-2 py-1 rounded-md text-[13px] transition-colors border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        active
          ? "pl-[6px] pr-2 border-primary bg-elevated text-foreground font-medium"
          : "px-2 border-transparent text-foreground-subtle hover:bg-elevated/40 hover:text-foreground",
      )}
    >
      {icon && (
        <span className="shrink-0 text-foreground-subtle/70">{icon}</span>
      )}
      <span className="truncate">{children}</span>
    </Link>
  );
}
