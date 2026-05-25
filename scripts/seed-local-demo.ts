/**
 * Local-only UI demo seed — creates a superadmin, an "Acme Demo" organization
 * and 10 sample tickets so contributors can explore the tickets module
 * (filters, glassmorphism background, command palette) without writing data
 * by hand.
 *
 * Usage: `npx tsx scripts/seed-local-demo.ts`
 *
 * Refuses to run unless DATABASE_URL points at localhost / 127.0.0.1 - this
 * script is NOT meant to touch a production database.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { auth } from '../src/lib/auth';
import { db } from '../src/lib/db';
import { users, organizations, organization_members, tickets } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

const DEMO_EMAIL = 'demo@local.test';
const DEMO_PASSWORD = 'DemoLocalP@ssw0rd!';
const ORG_SLUG = 'acme-demo';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error(
      `Refused: DATABASE_URL does not target localhost (${url.replace(/:[^:@]*@/, ':***@')})`
    );
  }

  // 1. User via Better Auth (proper password hashing)
  const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  let userId: string;
  if (existing.length === 0) {
    const res = await auth.api.signUpEmail({
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo User' },
    });
    userId = res.user.id;
    console.log(`[seed] user created ${DEMO_EMAIL} (id=${userId})`);
  } else {
    userId = existing[0].id;
    console.log(`[seed] user already exists ${DEMO_EMAIL} (id=${userId})`);
  }

  await db
    .update(users)
    .set({ is_superadmin: true, emailVerified: true })
    .where(eq(users.id, userId));
  console.log('[seed] superadmin flag applied');

  // 2. Organization
  const existingOrg = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, ORG_SLUG))
    .limit(1);
  let orgId: string;
  if (existingOrg.length === 0) {
    orgId = randomUUID();
    await db.insert(organizations).values({
      id: orgId,
      name: 'Acme Demo',
      slug: ORG_SLUG,
      description: 'Local UI demo - fictional data',
      color_primary: '#2563EB',
      color_secondary: '#1E40AF',
    });
    console.log(`[seed] org created ${ORG_SLUG} (id=${orgId})`);
  } else {
    orgId = existingOrg[0].id;
    console.log(`[seed] org already exists ${ORG_SLUG} (id=${orgId})`);
  }

  // 3. Admin membership
  const existingMember = await db
    .select()
    .from(organization_members)
    .where(eq(organization_members.user_id, userId))
    .limit(1);
  if (existingMember.length === 0) {
    await db.insert(organization_members).values({
      id: randomUUID(),
      organization_id: orgId,
      user_id: userId,
      role: 'admin',
    });
    console.log('[seed] admin membership created');
  }

  // 4. Varied tickets - generic scenarios, no real client data
  const existingTickets = await db
    .select()
    .from(tickets)
    .where(eq(tickets.organization_id, orgId))
    .limit(1);
  if (existingTickets.length === 0) {
    const specs: Array<{
      title: string;
      description: string;
      status: string;
      priority: string;
      category: string;
      tags?: string[];
    }> = [
      { title: 'SSO access denied for 3 users', description: 'Three accounts cannot reach the internal portal since this morning.', status: 'new', priority: 'critical', category: 'bug', tags: ['sso', 'prod'] },
      { title: 'Add CSV export on the contracts view', description: 'Required by quarterly accounting review.', status: 'new', priority: 'medium', category: 'feature' },
      { title: 'Publish internal API documentation', description: 'Doc to share with the team.', status: 'in_progress', priority: 'low', category: 'support' },
      { title: 'Glassmorphism redesign of the home page', description: 'Animated background and clearer CTA requested by leadership.', status: 'in_progress', priority: 'high', category: 'feature', tags: ['ui'] },
      { title: 'Node 20 LTS upgrade on staging VPS', description: 'Maintenance window planned for the weekend.', status: 'waiting_client', priority: 'medium', category: 'maintenance' },
      { title: 'Magic-link email blocked at recipient tenant', description: 'Recipient tenant tightened DMARC. Investigating Defender quarantine.', status: 'waiting_client', priority: 'high', category: 'bug', tags: ['email', 'dmarc'] },
      { title: 'Migrate the legacy email connector', description: 'Old scopes scheduled for deprecation.', status: 'in_progress', priority: 'medium', category: 'maintenance' },
      { title: 'Pagination bug on the deliverables tab', description: 'Page 2 duplicates rows for certain projects.', status: 'resolved', priority: 'low', category: 'bug' },
      { title: 'Training session request for the support team', description: '2-hour onboarding to plan.', status: 'resolved', priority: 'low', category: 'feature' },
      { title: 'Old incident, closed', description: 'Nothing to report.', status: 'closed', priority: 'low', category: 'support' },
    ];

    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      await db.insert(tickets).values({
        id: randomUUID(),
        organization_id: orgId,
        number: i + 1,
        title: s.title,
        description: s.description,
        status: s.status,
        priority: s.priority,
        category: s.category,
        tags: s.tags ?? [],
        creator_id: userId,
      });
    }
    console.log(`[seed] ${specs.length} tickets created`);
  } else {
    console.log('[seed] tickets already present, skipping');
  }

  console.log('\n  Sign-in:');
  console.log(`  email    : ${DEMO_EMAIL}`);
  console.log(`  password : ${DEMO_PASSWORD}`);
  console.log(`  URL      : http://localhost:3000/clients/${ORG_SLUG}/tickets`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
