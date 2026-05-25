import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { db } from './index';

async function main() {
  console.log('Exécution des migrations...');
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), 'src/lib/db/migrations'),
  });
  console.log('Migrations complétées');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erreur migration:', err);
  process.exit(1);
});
