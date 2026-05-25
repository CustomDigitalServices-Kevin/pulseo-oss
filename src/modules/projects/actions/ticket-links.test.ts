// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("@/modules/projects/test/db-test"));
vi.mock("@/lib/auth/session", async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, getSessionInfo: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/projects/feature-flag", () => ({
  isProjectsEnabled: () => true,
  isFlowPreviewEnabled: () => false,
  isMsappPreviewEnabled: () => false,
  isSolutionPreviewEnabled: () => false,
  isPbixPreviewEnabled: () => false,
}));
vi.mock("@/modules/projects/lib/scan-enqueue", async () => {
  const { db } = await import("@/modules/projects/test/db-test");
  const { projDeliverables } = await import("@/modules/projects/schema/tables");
  const { eq } = await import("drizzle-orm");
  return {
    enqueueVirusScan: async (opts: {
      entityType: string;
      entityId: string;
    }) => {
      if (opts.entityType === "deliverable") {
        await db
          .update(projDeliverables)
          .set({ virus_scan_status: "clean" })
          .where(eq(projDeliverables.id, opts.entityId));
      }
    },
  };
});

import {
  createTicketLinkFromAnnotation,
  linkExistingTicketToProject,
  listProjectTicketLinks,
} from "./ticket-links";
import { insertDeliverableWithVersioning } from "@/modules/projects/lib/deliverables-db";
import { getSessionInfo } from "@/lib/auth/session";
import {
  resetDb,
  db,
  projectsSchema,
  coreSchema,
} from "@/modules/projects/test/db-test";
import {
  makeUser,
  makeOrg,
  makeMembership,
  makeProject,
} from "@/modules/projects/test/fixtures";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

async function loginAs(user: { id: string; is_superadmin?: boolean }) {
  vi.mocked(getSessionInfo).mockResolvedValue({
    userId: user.id,
    isSuperadmin: user.is_superadmin ?? false,
  } as never);
}

async function seedDeliverable(
  projectId: string,
  orgId: string,
  userId: string,
): Promise<string> {
  const id = uuid();
  await insertDeliverableWithVersioning({
    id,
    projectId,
    organizationId: orgId,
    userId,
    version: "1.0",
    filePath: `/tmp/fake/${id}.zip`,
    originalName: "flow.zip",
    mimeType: "application/zip",
    sizeBytes: 1024,
    markAsLatest: true,
  });
  return id;
}

describe("createTicketLinkFromAnnotation", () => {
  it("crée ticket + lien en transaction atomique", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "gestionnaire");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const deliverableId = await seedDeliverable(project.id, org.id, user.id);
    await loginAs(user);

    const r = await createTicketLinkFromAnnotation({
      projectId: project.id,
      annotation: {
        type: "flow",
        deliverable_id: deliverableId,
        node_id: "Send_email",
      },
      title: "Action envoi mail trop lente",
      description: "Le node Send_email timeout régulièrement en prod",
      priority: "high",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.ticketNumber).toBe(1);

    const tickets = await db.select().from(coreSchema.tickets);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].title).toBe("Action envoi mail trop lente");

    const links = await db.select().from(projectsSchema.projTicketLinks);
    expect(links).toHaveLength(1);
    expect(links[0].deliverable_id).toBe(deliverableId);
    expect(links[0].preview_annotation).toMatchObject({
      type: "flow",
      node_id: "Send_email",
    });
  });

  it("refuse viewer", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "viewer");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    await loginAs(user);

    const r = await createTicketLinkFromAnnotation({
      projectId: project.id,
      annotation: { type: "flow", deliverable_id: uuid(), node_id: "x" },
      title: "Ticket test",
      description: "x",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("forbidden");
  });

  it("refuse IDOR cross-org", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(userA.id, orgA.id, "admin");
    const projectB = await makeProject({
      organization_id: orgB.id,
      created_by: userB.id,
    });
    await loginAs(userA);

    const r = await createTicketLinkFromAnnotation({
      projectId: projectB.id,
      annotation: { type: "flow", deliverable_id: uuid(), node_id: "x" },
      title: "Ticket test",
      description: "x",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("forbidden");
  });

  it("refuse annotation avec deliverable d'un autre projet (IDOR cross-deliverable)", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "admin");
    const project1 = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const project2 = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const delivP2 = await seedDeliverable(project2.id, org.id, user.id);
    await loginAs(user);

    const r = await createTicketLinkFromAnnotation({
      projectId: project1.id,
      annotation: { type: "flow", deliverable_id: delivP2, node_id: "x" },
      title: "Ticket test",
      description: "x",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("deliverable_cross_project");
  });

  it("rejette annotation invalide (regex defensive)", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "admin");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const deliverableId = await seedDeliverable(project.id, org.id, user.id);
    await loginAs(user);

    // node_id avec caractères interdits (< > pour XSS)
    const r = await createTicketLinkFromAnnotation({
      projectId: project.id,
      annotation: {
        type: "flow",
        deliverable_id: deliverableId,
        node_id: "<script>",
      },
      title: "Ticket test",
      description: "x",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("invalid_input");
  });

  it("écrit audit log ticket_link_created", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "admin");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const deliverableId = await seedDeliverable(project.id, org.id, user.id);
    await loginAs(user);

    const r = await createTicketLinkFromAnnotation({
      projectId: project.id,
      annotation: {
        type: "flow",
        deliverable_id: deliverableId,
        node_id: "Action1",
      },
      title: "Ticket test",
      description: "x",
    });
    expect(r.success).toBe(true);

    const logs = await db
      .select()
      .from(projectsSchema.projAuditLogs)
      .where(
        eq(projectsSchema.projAuditLogs.event_type, "ticket_link_created"),
      );
    expect(logs).toHaveLength(1);
  });

  it("numérotation des tickets incrémentale par org", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "admin");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const deliverableId = await seedDeliverable(project.id, org.id, user.id);
    await loginAs(user);

    const r1 = await createTicketLinkFromAnnotation({
      projectId: project.id,
      annotation: {
        type: "flow",
        deliverable_id: deliverableId,
        node_id: "A1",
      },
      title: "Ticket 1",
      description: "d1",
    });
    const r2 = await createTicketLinkFromAnnotation({
      projectId: project.id,
      annotation: {
        type: "flow",
        deliverable_id: deliverableId,
        node_id: "A2",
      },
      title: "Ticket 2",
      description: "d2",
    });
    expect(r1.success && r2.success).toBe(true);
    if (r1.success && r2.success) {
      expect(r1.data.ticketNumber).toBe(1);
      expect(r2.data.ticketNumber).toBe(2);
    }
  });
});

describe("listProjectTicketLinks", () => {
  it("retourne les tickets liés avec annotation info", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "admin");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const deliverableId = await seedDeliverable(project.id, org.id, user.id);
    await loginAs(user);

    await createTicketLinkFromAnnotation({
      projectId: project.id,
      annotation: {
        type: "flow",
        deliverable_id: deliverableId,
        node_id: "Send_Mail",
      },
      title: "Bug node Send_Mail",
      description: "x",
    });

    const r = await listProjectTicketLinks(project.id);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0].ticketTitle).toBe("Bug node Send_Mail");
    expect(r.data[0].annotation).toMatchObject({
      type: "flow",
      node_id: "Send_Mail",
    });
  });

  it("refuse cross-org", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(userA.id, orgA.id, "admin");
    const projectB = await makeProject({
      organization_id: orgB.id,
      created_by: userB.id,
    });
    await loginAs(userA);

    const r = await listProjectTicketLinks(projectB.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("forbidden");
  });
});

// ── linkExistingTicketToProject (UX overhaul) ───────────────────────────────

async function seedTicket(orgId: string, userId: string): Promise<string> {
  const id = uuid();
  await db.insert(coreSchema.tickets).values({
    id,
    organization_id: orgId,
    number: 1,
    title: "Test ticket",
    description: "Test description",
    category: "support",
    creator_id: userId,
  });
  return id;
}

describe("linkExistingTicketToProject", () => {
  it("crée le lien quand ticket+projet appartiennent à la même org", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "gestionnaire");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const ticketId = await seedTicket(org.id, user.id);
    await loginAs(user);

    const r = await linkExistingTicketToProject(ticketId, project.id);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.linkId).toBeTruthy();
    }

    const links = await db
      .select()
      .from(projectsSchema.projTicketLinks)
      .where(eq(projectsSchema.projTicketLinks.ticket_id, ticketId));
    expect(links).toHaveLength(1);
    expect(links[0].project_id).toBe(project.id);
  });

  it("idempotent — un 2e call retourne le même linkId existant", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "gestionnaire");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const ticketId = await seedTicket(org.id, user.id);
    await loginAs(user);

    const r1 = await linkExistingTicketToProject(ticketId, project.id);
    const r2 = await linkExistingTicketToProject(ticketId, project.id);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    if (r1.success && r2.success) {
      expect(r2.data.linkId).toBe(r1.data.linkId);
    }

    const links = await db
      .select()
      .from(projectsSchema.projTicketLinks)
      .where(eq(projectsSchema.projTicketLinks.ticket_id, ticketId));
    expect(links).toHaveLength(1);
  });

  it("refuse cross-org (ticket orgA + projet orgB)", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(userA.id, orgA.id, "gestionnaire");
    await makeMembership(userA.id, orgB.id, "gestionnaire");
    const projectB = await makeProject({
      organization_id: orgB.id,
      created_by: userB.id,
    });
    const ticketA = await seedTicket(orgA.id, userA.id);
    await loginAs(userA);

    const r = await linkExistingTicketToProject(ticketA, projectB.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("cross_org");
  });

  it("refuse si projet inexistant (404)", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "gestionnaire");
    const ticketId = await seedTicket(org.id, user.id);
    await loginAs(user);

    const r = await linkExistingTicketToProject(ticketId, uuid());
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("project_not_found");
  });

  it("refuse si ticket inexistant (404)", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "gestionnaire");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    await loginAs(user);

    const r = await linkExistingTicketToProject(uuid(), project.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("ticket_not_found");
  });

  it("refuse si user pas accès projets (forbidden)", async () => {
    const user = await makeUser();
    const owner = await makeUser();
    const org = await makeOrg();
    // user PAS dans organization_members → hasProjectsAccess = false
    const project = await makeProject({
      organization_id: org.id,
      created_by: owner.id,
    });
    const ticketId = await seedTicket(org.id, owner.id);
    await loginAs(user);

    const r = await linkExistingTicketToProject(ticketId, project.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("forbidden");
  });

  it("refuse si projet soft-deleted", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, "gestionnaire");
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
      deleted_at: new Date(),
    });
    const ticketId = await seedTicket(org.id, user.id);
    await loginAs(user);

    const r = await linkExistingTicketToProject(ticketId, project.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("project_deleted");
  });

  it("refuse si non authentifié", async () => {
    const user = await makeUser();
    const org = await makeOrg();
    const project = await makeProject({
      organization_id: org.id,
      created_by: user.id,
    });
    const ticketId = await seedTicket(org.id, user.id);
    vi.mocked(getSessionInfo).mockResolvedValue(null as never);

    const r = await linkExistingTicketToProject(ticketId, project.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("unauthenticated");
  });

  it("refuse input invalide (UUID malformé)", async () => {
    const user = await makeUser();
    await loginAs(user);

    const r = await linkExistingTicketToProject("not-a-uuid", "not-a-uuid");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("invalid_input");
  });
});
