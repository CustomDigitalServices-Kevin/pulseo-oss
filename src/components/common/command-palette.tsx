"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  ScrollText,
  Ticket,
  ClipboardList,
  Plus,
  Link2,
  LogOut,
  FileText,
} from "lucide-react";
import { signOut } from "@/lib/auth/client";

interface CommandPaletteProps {
  isAdmin?: boolean;
  /**
   * True when the current user is a "responsable" (gestionnaire or admin)
   * in at least one of their organisations, or is a platform superadmin.
   * Gates the Documents command — viewers should never see it.
   */
  canAccessDocuments?: boolean;
}

/**
 * Global command palette (Cmd+K / Ctrl+K).
 * Provides instant navigation and quick actions. The "Espace client" group
 * appears automatically when the user is viewing a `/clients/[slug]/...`
 * route — the slug is derived from the pathname so the layout doesn't have
 * to pass it explicitly.
 */
export function CommandPalette({
  isAdmin,
  canAccessDocuments,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common2");

  // Derive the active org slug from the current URL so "Espace client"
  // commands show up automatically inside `/clients/[slug]/*`.
  const activeSlug = useMemo(() => {
    const match = pathname?.match(/^\/clients\/([^/]+)/);
    return match?.[1];
  }, [pathname]);

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut({
      fetchOptions: {
        onSuccess: () => router.push("/login"),
      },
    });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("commandSearchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("commandNoResults")}</CommandEmpty>

        <CommandGroup heading={t("commandGroupNavigation")}>
          {isAdmin ? (
            <>
              <CommandItem onSelect={() => go("/admin/dashboard")}>
                <LayoutDashboard className="text-muted-foreground" />
                <span>{t("commandDashboard")}</span>
                <CommandShortcut>G D</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/clients")}>
                <Users className="text-muted-foreground" />
                <span>{t("commandOrganizations")}</span>
                <CommandShortcut>G O</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/magic-links")}>
                <Link2 className="text-muted-foreground" />
                <span>{t("commandMagicLinks")}</span>
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/audit")}>
                <ClipboardList className="text-muted-foreground" />
                <span>{t("commandAuditLogs")}</span>
                <CommandShortcut>G A</CommandShortcut>
              </CommandItem>
            </>
          ) : (
            <CommandItem onSelect={() => go("/clients")}>
              <LayoutDashboard className="text-muted-foreground" />
              <span>{t("commandMyOrgs")}</span>
              <CommandShortcut>G O</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>

        {activeSlug && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("commandGroupClientSpace")}>
              <CommandItem onSelect={() => go(`/clients/${activeSlug}`)}>
                <LayoutDashboard className="text-muted-foreground" />
                <span>{t("commandOverview")}</span>
              </CommandItem>
              <CommandItem
                onSelect={() => go(`/clients/${activeSlug}/tickets`)}
              >
                <Ticket className="text-muted-foreground" />
                <span>{t("commandTickets")}</span>
                <CommandShortcut>G T</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => go(`/clients/${activeSlug}/tickets/new`)}
              >
                <Plus className="text-muted-foreground" />
                <span>{t("commandNewTicket")}</span>
                <CommandShortcut>N T</CommandShortcut>
              </CommandItem>
              {(isAdmin || canAccessDocuments) && (
                <CommandItem
                  onSelect={() => go(`/clients/${activeSlug}/contracts`)}
                >
                  <ScrollText className="text-muted-foreground" />
                  <span>{t("commandContracts")}</span>
                  <CommandShortcut>G C</CommandShortcut>
                </CommandItem>
              )}
              {(isAdmin || canAccessDocuments) && (
                <CommandItem
                  onSelect={() => go(`/clients/${activeSlug}/documents`)}
                >
                  <FileText className="text-muted-foreground" />
                  <span>{t("commandDocuments")}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading={t("commandGroupAccount")}>
          <CommandItem onSelect={handleSignOut}>
            <LogOut className="text-muted-foreground" />
            <span>{t("commandSignOut")}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
