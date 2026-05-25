import 'dotenv/config';
import { db } from './index';
import { users, organizations, organization_members } from './schema';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';

/**
 * Idempotent seed:
 *   1. flag an existing Better Auth account as platform super-admin
 *   2. create two demo organizations (Acme + Demo Org)
 *   3. enrol the super-admin as `admin` in both
 *
 * The seed assumes the super-admin account already exists. Sign up at
 *   POST /api/auth/sign-up/email
 * BEFORE running this script. The expected email is read from
 * `SEED_ADMIN_EMAIL` (defaults to `admin@example.com`).
 */
const ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD_HINT =
  process.env.SEED_ADMIN_PASSWORD_HINT ?? '(set during sign-up)';

async function main() {
  console.log('Seeding database...');

  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.email, ADMIN_EMAIL),
  });

  if (!existingAdmin) {
    console.error(
      `Error: create the admin account first (${ADMIN_EMAIL}) via POST /api/auth/sign-up/email`
    );
    process.exit(1);
  }

  const adminId = existingAdmin.id;
  console.log(`Admin found: ${adminId}`);

  await db
    .update(users)
    .set({ is_superadmin: true })
    .where(eq(users.id, adminId));

  const acmeOrgId = uuid();
  await db
    .insert(organizations)
    .values({
      id: acmeOrgId,
      name: 'Acme Corp',
      slug: 'acme-corp',
      description: 'Demo organization for development',
      color_primary: '#2563EB',
      color_secondary: '#1E40AF',
    })
    .onConflictDoNothing();

  const demoOrgId = uuid();
  await db
    .insert(organizations)
    .values({
      id: demoOrgId,
      name: 'Demo Org',
      slug: 'demo-org',
      description: 'Second demo organization to exercise multi-tenant flows',
      color_primary: '#2563EB',
      color_secondary: '#1E40AF',
    })
    .onConflictDoNothing();

  await db
    .insert(organization_members)
    .values([
      { id: uuid(), organization_id: acmeOrgId, user_id: adminId, role: 'admin' },
      { id: uuid(), organization_id: demoOrgId, user_id: adminId, role: 'admin' },
    ])
    .onConflictDoNothing();

  console.log('Seed complete.');
  console.log('');
  console.log('Admin account:');
  console.log(`  Email   : ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD_HINT}`);
  console.log('');
  console.log('Organizations:');
  console.log('  Acme Corp (slug: acme-corp)');
  console.log('  Demo Org  (slug: demo-org)');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
