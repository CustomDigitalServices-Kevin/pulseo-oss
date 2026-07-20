import { db } from '@/lib/db';
import {
  organization_members,
  users,
  organizations,
  organization_responsibles,
} from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { sendEmail, escapeHtml } from '@/lib/email';
import { appConfig, getServerAppUrl, getEmailFooterBrand } from '@/config/app-config';

/**
 * Return the emails of every platform super-admin. These users are CC'd
 * on every ticket notification so platform operators retain full
 * visibility across all tenants without being a member of each org.
 */
export async function getSuperadminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.is_superadmin, true));
  return rows.map((r) => r.email);
}

/**
 * Recupere les emails de tous les destinataires d'une notification ticket :
 * - Tous les gestionnaires et admins de l'org
 * - Le createur du ticket (via creator_id ou guest_email)
 * - Les responsables cote client (sauf si includeClientContacts = false)
 * - Tous les super-admins de la plateforme
 * - Deduplique et exclut l'acteur
 *
 * `includeClientContacts: false` sert aux evenements internes (commentaires
 * staff-only) : les contacts externes (responsables + colonne legacy) ne
 * doivent jamais recevoir de contenu interne.
 */
export async function getTicketNotificationRecipients({
  orgId,
  ticketCreatorId,
  guestEmail,
  excludeActorId,
  includeClientContacts = true,
}: {
  orgId: string;
  ticketCreatorId: string | null;
  guestEmail: string | null;
  excludeActorId: string;
  includeClientContacts?: boolean;
}): Promise<string[]> {
  const emails = new Set<string>();

  // 1. Recupere tous les gestionnaires + admins de l'org
  const managersMembers = await db
    .select({
      userId: organization_members.user_id,
      role: organization_members.role,
    })
    .from(organization_members)
    .where(
      and(
        eq(organization_members.organization_id, orgId),
        inArray(organization_members.role, ['gestionnaire', 'admin'])
      )
    );

  if (managersMembers.length > 0) {
    const managerUserIds = managersMembers.map((m) => m.userId);
    const managerUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, managerUserIds));

    for (const u of managerUsers) {
      emails.add(u.email);
    }
  }

  // 2. Recupere l'email du createur du ticket
  if (ticketCreatorId) {
    const creator = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, ticketCreatorId),
      columns: { email: true },
    });
    if (creator) {
      emails.add(creator.email);
    }
  }

  // 3. Ajoute le guest_email si present
  if (guestEmail) {
    emails.add(guestEmail);
  }

  // 4. Responsables cote client (contacts externes). On additionne :
  //    - table `organization_responsibles` (multi-recipient)
  //    - colonne legacy `organizations.responsible_email` (single, historique)
  //    Saute entierement pour les evenements internes (staff-only).
  if (includeClientContacts) {
    const [respRows, orgMeta] = await Promise.all([
      db
        .select({ email: organization_responsibles.email })
        .from(organization_responsibles)
        .where(eq(organization_responsibles.organization_id, orgId)),
      db
        .select({ responsibleEmail: organizations.responsible_email })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1),
    ]);
    for (const r of respRows) {
      emails.add(r.email);
    }
    const legacyEmail = orgMeta[0]?.responsibleEmail;
    if (legacyEmail) {
      emails.add(legacyEmail);
    }
  }

  // 5. Super-admins plateforme (visibilite cross-org)
  for (const email of await getSuperadminEmails()) {
    emails.add(email);
  }

  // 6. Exclut l'acteur
  const actor = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, excludeActorId),
    columns: { email: true },
  });
  if (actor) {
    emails.delete(actor.email);
  }

  return [...emails];
}

/**
 * Fetch every "responsable" contact of an organization — union of the
 * `organization_responsibles` table (multi) and the legacy single column
 * on `organizations`. Deduplicated by email, order preserved (multi rows
 * first, legacy last). Used by the invite flow to notify every lead.
 */
export async function getOrganizationResponsibles(
  orgId: string
): Promise<Array<{ email: string; name: string | null }>> {
  const [rows, orgMeta] = await Promise.all([
    db
      .select({
        email: organization_responsibles.email,
        name: organization_responsibles.name,
      })
      .from(organization_responsibles)
      .where(eq(organization_responsibles.organization_id, orgId))
      .orderBy(organization_responsibles.created_at),
    db
      .select({
        email: organizations.responsible_email,
        name: organizations.responsible_name,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
  ]);

  const seen = new Set<string>();
  const out: Array<{ email: string; name: string | null }> = [];
  for (const r of rows) {
    if (seen.has(r.email)) continue;
    seen.add(r.email);
    out.push({ email: r.email, name: r.name ?? null });
  }
  const legacy = orgMeta[0];
  if (legacy?.email && !seen.has(legacy.email)) {
    seen.add(legacy.email);
    out.push({ email: legacy.email, name: legacy.name ?? null });
  }
  return out;
}

/**
 * Return the slug of an organization — used to build ticket deep-links
 * in notification emails.
 */
export async function getOrganizationSlug(orgId: string): Promise<string | null> {
  const row = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row[0]?.slug ?? null;
}

/**
 * Best-effort notification of every "responsable" contact of an org when
 * a new membership is granted via the invite-link accept flow.
 *
 * Distinguishes 'registered' (account just created — user.created_at
 * within 5 min of now) from 'rejoined' (existing account, just gained
 * access to the org). Failures are NOT thrown — caller must guard.
 */
export async function notifyResponsiblesOfMember(args: {
  userId: string;
  orgId: string;
}): Promise<void> {
  const [userRow, orgRow] = await Promise.all([
    db.query.users.findFirst({
      where: (u, { eq: e }) => e(u.id, args.userId),
      columns: { name: true, email: true, createdAt: true },
    }),
    db.query.organizations.findFirst({
      where: (o, { eq: e }) => e(o.id, args.orgId),
      columns: { name: true, slug: true },
    }),
  ]);

  if (!userRow || !orgRow) return;

  const responsibles = await getOrganizationResponsibles(args.orgId);
  if (responsibles.length === 0) return;

  const NEW_USER_WINDOW_MS = 5 * 60 * 1000;
  const isFreshSignUp =
    userRow.createdAt &&
    Date.now() - new Date(userRow.createdAt).getTime() < NEW_USER_WINDOW_MS;
  const type: 'registered' | 'rejoined' = isFreshSignUp ? 'registered' : 'rejoined';

  const appUrl = getServerAppUrl();
  const personName = userRow.name ?? userRow.email;
  const safeName = escapeHtml(personName);
  const safeEmail = escapeHtml(userRow.email);
  const safeOrg = escapeHtml(orgRow.name);
  const safeAppName = escapeHtml(appConfig.name);
  const safePrimary = escapeHtml(appConfig.primaryColor);

  const subject =
    type === 'registered'
      ? `[${appConfig.name}] Nouveau compte cree pour ${orgRow.name}`
      : `[${appConfig.name}] Connexion a ${orgRow.name}`;
  const message =
    type === 'registered'
      ? `<strong>${safeName}</strong> (${safeEmail}) vient de creer un compte ${safeAppName} dans votre organisation <strong>${safeOrg}</strong>.`
      : `<strong>${safeName}</strong> (${safeEmail}) vient de se reconnecter a votre organisation <strong>${safeOrg}</strong>.`;

  for (const responsible of responsibles) {
    const greeting = responsible.name
      ? `Bonjour ${escapeHtml(responsible.name)},`
      : 'Bonjour,';
    await sendEmail({
      to: responsible.email,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
          <h2 style="color:${safePrimary};margin:0 0 12px;">Notification ${safeAppName}</h2>
          <p style="margin:0 0 10px;">${greeting}</p>
          <p style="margin:0 0 16px;">${message}</p>
          <p style="margin:0 0 16px;">
            <a href="${appUrl}/clients/${encodeURIComponent(orgRow.slug)}" style="display:inline-block;padding:10px 18px;background:${safePrimary};color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">
              Ouvrir ${safeOrg}
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#999;font-size:11px;">Vous recevez cet email en tant que responsable client de ${safeOrg} — defini dans ${escapeHtml(getEmailFooterBrand())}.</p>
        </div>
      `,
    });
  }
}
